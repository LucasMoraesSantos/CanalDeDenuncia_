import { createPrivateKey, createSign, randomUUID } from "node:crypto";

const SHEET_ID = "1ZInMLJ2Szf_OXQomQAIxYvyK4fmvxqTHD69a1bgREyo";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const ALLOWED_PEOPLE = new Set([
  "Lucas",
  "João G.",
  "Marcela",
  "Agnys",
  "Maju",
  "Isabella",
  "Peterson",
  "Herick",
]);

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });

const toBase64Url = (value) =>
  Buffer.from(typeof value === "string" ? value : JSON.stringify(value)).toString("base64url");

export const normalizePrivateKey = (rawValue) => {
  let value = rawValue.trim();

  if (value.startsWith("{")) {
    const credentials = JSON.parse(value);
    value = credentials.private_key || "";
  } else if (value.startsWith('"') && value.endsWith('"')) {
    value = JSON.parse(value);
  }

  value = value.replace(/\\n/g, "\n").replace(/\r/g, "").trim();

  if (!value.includes("BEGIN") && /^[A-Za-z0-9+/=]+$/.test(value)) {
    const decoded = Buffer.from(value, "base64").toString("utf8").trim();
    if (decoded.includes("BEGIN")) value = decoded;
  }

  if (!value.includes("-----BEGIN PRIVATE KEY-----")) {
    throw new Error("A variável GOOGLE_PRIVATE_KEY não contém uma chave privada válida.");
  }

  return value;
};

const getAccessToken = async () => {
  let email = Netlify.env.get("GOOGLE_SERVICE_ACCOUNT_EMAIL");
  let rawPrivateKey = Netlify.env.get("GOOGLE_PRIVATE_KEY");
  const credentialsJson = Netlify.env.get("GOOGLE_SERVICE_ACCOUNT_JSON");

  if (credentialsJson) {
    try {
      const credentials = JSON.parse(credentialsJson);
      email ||= credentials.client_email;
      rawPrivateKey ||= credentials.private_key;
    } catch {
      throw new Error("A variável GOOGLE_SERVICE_ACCOUNT_JSON não contém um JSON válido.");
    }
  }

  if (!email || !rawPrivateKey) {
    throw new Error("A integração com o Google Planilhas ainda não foi configurada.");
  }

  let privateKey;
  try {
    privateKey = normalizePrivateKey(rawPrivateKey);
    createPrivateKey(privateKey);
  } catch {
    throw new Error(
      "A chave privada do Google está inválida. Copie novamente o campo private_key sem aspas externas.",
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const header = toBase64Url({ alg: "RS256", typ: "JWT" });
  const claims = toBase64Url({
    iss: email,
    scope: SHEETS_SCOPE,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
  });
  const unsignedToken = `${header}.${claims}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsignedToken);
  signer.end();
  const signature = signer.sign(privateKey, "base64url");

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${unsignedToken}.${signature}`,
    }),
  });
  const result = await response.json();

  if (!response.ok) throw new Error("Não foi possível autenticar no Google Planilhas.");
  return result.access_token;
};

export default async (request) => {
  if (request.method !== "POST") return json({ message: "Método não permitido." }, 405);

  try {
    const { person, description, evidenceNames = [] } = await request.json();

    if (typeof person !== "string" || !ALLOWED_PEOPLE.has(person)) {
      return json({ message: "Selecione a pessoa relacionada." }, 400);
    }
    if (typeof description !== "string" || !description.trim() || description.length > 1500) {
      return json({ message: "Informe uma descrição válida de até 1500 caracteres." }, 400);
    }
    if (
      !Array.isArray(evidenceNames) ||
      evidenceNames.length > 5 ||
      evidenceNames.some((name) => typeof name !== "string" || name.length > 255)
    ) {
      return json({ message: "A lista de evidências é inválida." }, 400);
    }

    const protocol = `DEN-${randomUUID().split("-")[0].toUpperCase()}`;
    const createdAt = new Date().toISOString();
    const sheetName = Netlify.env.get("GOOGLE_SHEET_NAME") || "Denuncias";
    const range = encodeURIComponent(`${sheetName}!A:E`);
    const accessToken = await getAccessToken();
    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${range}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          values: [[protocol, createdAt, person.trim(), description.trim(), evidenceNames.join(", ")]],
        }),
      },
    );

    if (!response.ok) {
      const details = await response.text();
      console.error("Google Sheets error:", response.status, details);
      throw new Error("Não foi possível registrar a denúncia na planilha.");
    }

    return json({ message: "Denúncia registrada com sucesso.", protocol }, 201);
  } catch (error) {
    console.error("Report submission error:", error.message);
    const safeMessages = [
      "A integração com o Google Planilhas ainda não foi configurada.",
      "A variável GOOGLE_SERVICE_ACCOUNT_JSON não contém um JSON válido.",
      "A chave privada do Google está inválida. Copie novamente o campo private_key sem aspas externas.",
      "Não foi possível autenticar no Google Planilhas.",
      "Não foi possível registrar a denúncia na planilha.",
    ];
    const message = safeMessages.includes(error.message)
      ? error.message
      : "Erro interno ao registrar a denúncia.";
    return json({ message }, 500);
  }
};
