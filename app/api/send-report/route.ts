import { google } from "googleapis";
import { NextResponse } from "next/server";
import {
  parseSheetDestinations,
  type SheetDestination,
} from "../../../lib/sheet-destinations";
import { getMissingNotifierEnvVars, notifyToLine } from "@/lib/notifiers";
import {
  normalizeEnvValue,
  normalizeMultilineEnvValue,
  toJstIsoString,
} from "@/lib/env-utils";

type SendReportBody = {
  message?: string;
  toolName?: string;
  destinationId?: string;
};

function getConfiguredDestinations(): SheetDestination[] {
  const fromJson = parseSheetDestinations(process.env.SHEETS_DESTINATIONS_JSON);
  if (fromJson.length > 0) {
    return fromJson;
  }

  if (!process.env.GOOGLE_SPREADSHEET_ID) {
    return [];
  }

  return [
    {
      id: process.env.GOOGLE_SPREADSHEET_ID,
      label: "Default Spreadsheet",
      sheetName: process.env.GOOGLE_SHEET_NAME || "Sheet1",
    },
  ];
}

function getMissingEnvVars() {
  const missing: string[] = [];
  if (!normalizeEnvValue(process.env.LINE_TARGET_USER_ID)) {
    missing.push("LINE_TARGET_USER_ID");
  }
  if (!normalizeEnvValue(process.env.GOOGLE_CLIENT_EMAIL)) {
    missing.push("GOOGLE_CLIENT_EMAIL");
  }
  if (!normalizeMultilineEnvValue(process.env.GOOGLE_PRIVATE_KEY)) {
    missing.push("GOOGLE_PRIVATE_KEY");
  }
  missing.push(...getMissingNotifierEnvVars());
  return missing;
}

async function appendToGoogleSheet(params: {
  destination: SheetDestination;
  toolName: string;
  message: string;
}) {
  const clientEmail = normalizeEnvValue(process.env.GOOGLE_CLIENT_EMAIL);
  const privateKey = normalizeMultilineEnvValue(process.env.GOOGLE_PRIVATE_KEY);
  if (!clientEmail || !privateKey) {
    throw new Error("Google credentials are not configured");
  }

  const auth = new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  const sheets = google.sheets({ version: "v4", auth });
  const sheetName = params.destination.sheetName || "Sheet1";

  await sheets.spreadsheets.values.append({
    spreadsheetId: params.destination.id,
    range: `${sheetName}!A:E`,
    valueInputOption: "RAW",
    requestBody: {
      values: [
        [
          toJstIsoString(),
          params.toolName,
          params.message,
          "sent_to_line",
          params.destination.label,
        ],
      ],
    },
  });
}

export async function POST(request: Request) {
  try {
    const missing = getMissingEnvVars();
    if (missing.length > 0) {
      return NextResponse.json(
        {
          ok: false,
          error: "missing_env_vars",
          missing,
        },
        { status: 500 }
      );
    }

    const body = (await request.json()) as SendReportBody;
    const message = body.message?.trim();
    const toolName = body.toolName?.trim() || "未指定ツール";
    const destinationId = body.destinationId?.trim();

    if (!message) {
      return NextResponse.json(
        {
          ok: false,
          error: "message_required",
        },
        { status: 400 }
      );
    }

    const destinations = getConfiguredDestinations();
    const destination =
      destinations.find((item) => item.id === destinationId) ?? destinations[0];

    if (!destination) {
      return NextResponse.json(
        {
          ok: false,
          error: "sheet_destination_not_configured",
        },
        { status: 400 }
      );
    }

    await notifyToLine({
      to: normalizeEnvValue(process.env.LINE_TARGET_USER_ID),
      message,
    });
    await appendToGoogleSheet({
      destination,
      toolName,
      message,
    });

    return NextResponse.json({
      ok: true,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "send_failed",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

