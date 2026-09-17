import { createPrivateKey, createSign, randomUUID } from "node:crypto";
import { getStore } from "@netlify/blobs";

export const SHEET_ID = "1ZInMLJ2Szf_OXQomQAIxYvyK4fmvxqTHD69a1bgREyo";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });

export const publicError = (message) => Object.assign(new Error(message), { isPublic: true });

export const getGoogleError = async (response) => {
  const details = await response.text();
  let apiMessage = "";

  try {
    apiMessage = JSON.parse(details).error?.message || "";
  } catch {
    // A resposta nem sempre é JSON; os detalhes completos permanecem apenas nos logs.
  }

  console.error("Google Sheets error:", response.status, details);

  if (response.status === 403 && /disabled|has not been used|SERVICE_DISABLED/i.test(details)) {
    return publicError("A Google Sheets API não está ativada no projeto da conta de serviço.");
  }
  if (response.status === 403) {
    return publicError("Compartilhe a planilha com o e-mail da conta de serviço como Editor.");
  }
  if (response.status === 404) {
    return publicError("A planilha configurada não foi encontrada pela conta de serviço.");
  }
  if (/Unable to parse range/i.test(apiMessage)) {
    return publicError("A aba configurada não existe na planilha.");
  }

  return publicError("Não foi possível registrar a denúncia na planilha.");
};

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

  value = value.replace(/\\+r?\\*n/g, "\n").replace(/\r/g, "").trim();

  if (!value.includes("BEGIN") && /^[A-Za-z0-9+/=]+$/.test(value)) {
    const decoded = Buffer.from(value, "base64").toString("utf8").trim();
    if (decoded.includes("BEGIN")) value = decoded;
  }

  const pemMatch = value.match(
    /-----BEGIN PRIVATE KEY-----([\s\S]*?)-----END PRIVATE KEY-----/,
  );

  if (!pemMatch) {
    throw new Error("A variável GOOGLE_PRIVATE_KEY não contém uma chave privada válida.");
  }

  const body = pemMatch[1].replace(/[^A-Za-z0-9+/=]/g, "");
  if (!body) throw new Error("A variável GOOGLE_PRIVATE_KEY está vazia.");

  const lines = body.match(/.{1,64}/g);
  return `-----BEGIN PRIVATE KEY-----\n${lines.join("\n")}\n-----END PRIVATE KEY-----`;
};

export const getAccessToken = async () => {
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
    const contentType = request.headers.get("content-type") || "";
    let person;
    let description;
    let evidenceFiles = [];

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      person = formData.get("person");
      description = formData.get("description");
      evidenceFiles = formData.getAll("evidence").filter((entry) => entry instanceof File);
    } else {
      const body = await request.json();
      person = body.person;
      description = body.description;
    }

    if (typeof person !== "string" || !person.trim() || person.length > 100) {
      return json({ message: "Selecione a pessoa relacionada." }, 400);
    }
    if (typeof description !== "string" || !description.trim() || description.length > 1500) {
      return json({ message: "Informe uma descrição válida de até 1500 caracteres." }, 400);
    }
    if (evidenceFiles.length > 5 || evidenceFiles.some((file) => file.size > 4 * 1024 * 1024)) {
      return json({ message: "Envie no máximo 5 arquivos de até 4 MB cada." }, 400);
    }

    const protocol = `DEN-${randomUUID().split("-")[0].toUpperCase()}`;
    const createdAt = new Date().toISOString();
    const evidenceStore = getStore("report-evidence");
    const evidence = await Promise.all(
      evidenceFiles.map(async (file) => {
        const key = `${protocol}/${randomUUID()}`;
        await evidenceStore.set(key, await file.arrayBuffer(), {
          metadata: { name: file.name, type: file.type || "application/octet-stream" },
        });
        return { key, name: file.name, type: file.type || "application/octet-stream" };
      }),
    );
    const accessToken = await getAccessToken();
    const configuredSheetName = Netlify.env.get("GOOGLE_SHEET_NAME")?.trim();
    const metadataResponse = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}?fields=sheets.properties.title`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );

    if (!metadataResponse.ok) throw await getGoogleError(metadataResponse);

    const metadata = await metadataResponse.json();
    const sheetNames = metadata.sheets?.map(({ properties }) => properties.title) || [];
    const preferredSheetName = configuredSheetName || "Denuncias";
    const sheetName = sheetNames.includes(preferredSheetName)
      ? preferredSheetName
      : configuredSheetName
        ? null
        : sheetNames[0];

    if (!sheetName) {
      throw publicError(`A aba “${preferredSheetName}” não foi encontrada na planilha.`);
    }

    const escapedSheetName = sheetName.replaceAll("'", "''");
    const range = encodeURIComponent(`'${escapedSheetName}'!A:E`);
    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${range}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          values: [[protocol, createdAt, person.trim(), description.trim(), JSON.stringify(evidence)]],
        }),
      },
    );

    if (!response.ok) {
      throw await getGoogleError(response);
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
      "A Google Sheets API não está ativada no projeto da conta de serviço.",
      "Compartilhe a planilha com o e-mail da conta de serviço como Editor.",
      "A planilha configurada não foi encontrada pela conta de serviço.",
      "A aba configurada não existe na planilha.",
    ];
    const message = error.isPublic || safeMessages.includes(error.message)
      ? error.message
      : "Erro interno ao registrar a denúncia.";
    return json({ message }, 500);
  }
};
