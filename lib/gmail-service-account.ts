import { randomBytes } from "crypto";
import { google } from "googleapis";

const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";

type ServiceAccountKey = {
  client_email: string;
  private_key: string;
};

/** Inline image for multipart/related (CID). References in HTML as src="cid:your_cid" */
export type GmailInlineImage = {
  cid: string;
  contentType: string;
  content: Buffer;
};

export type SendGmailParams = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  impersonatedUser: string;
  fromName?: string;
  inlineImages?: GmailInlineImage[];
};

function getServiceAccountKeyFromEnv(): ServiceAccountKey {
  const raw = process.env.GMAIL_SERVICE_ACCOUNT_KEY?.trim();
  if (!raw) {
    throw new Error("Missing GMAIL_SERVICE_ACCOUNT_KEY environment variable.");
  }

  let parsed: Partial<ServiceAccountKey>;
  try {
    parsed = JSON.parse(raw) as Partial<ServiceAccountKey>;
  } catch {
    throw new Error("GMAIL_SERVICE_ACCOUNT_KEY is not valid JSON.");
  }

  const clientEmail = parsed.client_email?.trim();
  const privateKey = parsed.private_key?.replace(/\\n/g, "\n").trim();

  if (!clientEmail || !privateKey) {
    throw new Error(
      "GMAIL_SERVICE_ACCOUNT_KEY JSON must include client_email and private_key.",
    );
  }

  return {
    client_email: clientEmail,
    private_key: privateKey,
  };
}

function toBase64Url(value: string) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function foldBase64(buffer: Buffer): string {
  const b64 = buffer.toString("base64");
  const lines: string[] = [];
  for (let i = 0; i < b64.length; i += 76) {
    lines.push(b64.slice(i, i + 76));
  }
  return lines.join("\r\n");
}

function buildMimeMessage(params: SendGmailParams) {
  const from = params.fromName?.trim()
    ? `${params.fromName.trim()} <${params.impersonatedUser}>`
    : params.impersonatedUser;

  const headers = [
    `From: ${from}`,
    `To: ${params.to}`,
    `Subject: ${params.subject}`,
    "MIME-Version: 1.0",
  ];

  if (params.html && params.inlineImages?.length) {
    const related = `lu_rel_${randomBytes(14).toString("hex")}`;
    const alt = `lu_alt_${randomBytes(14).toString("hex")}`;

    const imageBlocks = params.inlineImages
      .map((img) => {
        const safeCid = img.cid.replace(/[^\w@-]/g, "");
        return [
          `--${related}`,
          `Content-Type: ${img.contentType}`,
          "Content-Transfer-Encoding: base64",
          `Content-ID: <${safeCid}>`,
          'Content-Disposition: inline; filename="logo"',
          "",
          foldBase64(img.content),
        ].join("\r\n");
      })
      .join("\r\n");

    return [
      ...headers,
      `Content-Type: multipart/related; boundary="${related}"; type="multipart/alternative"`,
      "",
      `--${related}`,
      `Content-Type: multipart/alternative; boundary="${alt}"`,
      "",
      `--${alt}`,
      'Content-Type: text/plain; charset="UTF-8"',
      "Content-Transfer-Encoding: 8bit",
      "",
      params.text,
      `--${alt}`,
      'Content-Type: text/html; charset="UTF-8"',
      "Content-Transfer-Encoding: 8bit",
      "",
      params.html,
      `--${alt}--`,
      imageBlocks,
      `--${related}--`,
    ].join("\r\n");
  }

  if (params.html) {
    const boundary = `lu_${randomBytes(16).toString("hex")}`;
    return [
      ...headers,
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      "",
      `--${boundary}`,
      'Content-Type: text/plain; charset="UTF-8"',
      "Content-Transfer-Encoding: 8bit",
      "",
      params.text,
      `--${boundary}`,
      'Content-Type: text/html; charset="UTF-8"',
      "Content-Transfer-Encoding: 8bit",
      "",
      params.html,
      `--${boundary}--`,
    ].join("\r\n");
  }

  return [
    ...headers,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    params.text,
  ].join("\r\n");
}

export async function sendEmailWithServiceAccount(params: SendGmailParams) {
  const key = getServiceAccountKeyFromEnv();
  const jwt = new google.auth.JWT({
    email: key.client_email,
    key: key.private_key,
    scopes: [GMAIL_SEND_SCOPE],
    subject: params.impersonatedUser,
  });

  const gmail = google.gmail({ version: "v1", auth: jwt });
  const raw = toBase64Url(buildMimeMessage(params));

  await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw },
  });
}
