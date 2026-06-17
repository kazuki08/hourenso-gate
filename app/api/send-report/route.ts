import { google } from "googleapis";
import { NextResponse } from "next/server";
import {
  parseSheetDestinations,
  type SheetDestination,
} from "../../../lib/sheet-destinations";

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
  const required = [
    "LINE_CHANNEL_ACCESS_TOKEN",
    "LINE_TARGET_USER_ID",
    "GOOGLE_CLIENT_EMAIL",
    "GOOGLE_PRIVATE_KEY",
  ] as const;

  return required.filter((key) => !process.env[key]);
}

async function sendLineMessage(message: string) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const targetUserId = process.env.LINE_TARGET_USER_ID;

  const response = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      to: targetUserId,
      messages: [{ type: "text", text: message }],
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`LINE send failed: ${response.status} ${detail}`);
  }
}

async function appendToGoogleSheet(params: {
  destination: SheetDestination;
  toolName: string;
  message: string;
}) {
  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
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
          new Date().toISOString(),
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

    await sendLineMessage(message);
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

