import { timingSafeEqual } from "node:crypto";
import { getStore } from "@netlify/blobs";
import { getAccessToken, getGoogleError, publicError, SHEET_ID } from "./submit-report.mjs";

const json = (body, status = 200) => Response.json(body, { status });
const INITIAL_PEOPLE = ["Lucas", "João G.", "Marcela", "Agnys", "Maju", "Isabella", "Peterson", "Herick"];

const isAuthorized = (request) => {
  const expected = Netlify.env.get("ADMIN_PASSWORD") || "";
  const received = request.headers.get("x-admin-password") || "";
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(received);
  return Boolean(expected) && expectedBuffer.length === receivedBuffer.length && timingSafeEqual(expectedBuffer, receivedBuffer);
};

const googleFetch = async (url, options = {}) => {
  const token = await getAccessToken();
  const response = await fetch(url, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...options.headers },
  });
  if (!response.ok) throw await getGoogleError(response);
  return response;
};

const getSheets = async () => {
  const response = await googleFetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}?fields=sheets.properties`);
  return (await response.json()).sheets || [];
};

const getReports = async () => {
  const sheets = await getSheets();
  const configured = Netlify.env.get("GOOGLE_SHEET_NAME")?.trim();
  const title = configured || sheets.find(({ properties }) => properties.title === "Denuncias")?.properties.title || sheets.find(({ properties }) => properties.title !== "Pessoas")?.properties.title;
  if (!title) throw publicError("A aba de denúncias não foi encontrada.");
  const range = encodeURIComponent(`'${title.replaceAll("'", "''")}'!A2:G`);
  const response = await googleFetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${range}`);
  const data = await response.json();
  return (data.values || []).map(([protocol = "", date = "", person = "", description = "", rawEvidence = "", status = "", rawPoints = "0"]) => {
    let evidence = [];
    try { evidence = JSON.parse(rawEvidence); } catch { if (rawEvidence) evidence = [{ name: rawEvidence, key: null }]; }
    const points = Number(rawPoints) || 0;
    return { protocol, date, person, description, evidence, status, points };
  });
};

const ensurePeopleSheet = async () => {
  const sheets = await getSheets();
  if (sheets.some(({ properties }) => properties.title === "Pessoas")) return;
  await googleFetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({ requests: [{ addSheet: { properties: { title: "Pessoas" } } }] }),
  });
  const range = encodeURIComponent("'Pessoas'!A1:A9");
  await googleFetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${range}?valueInputOption=RAW`, {
    method: "PUT",
    body: JSON.stringify({ values: [["Nome"], ...INITIAL_PEOPLE.map((name) => [name])] }),
  });
};

const getPeople = async () => {
  await ensurePeopleSheet();
  const range = encodeURIComponent("'Pessoas'!A2:A");
  const response = await googleFetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${range}`);
  return ((await response.json()).values || []).flat().filter(Boolean);
};

export default async (request) => {
  if (!isAuthorized(request)) return json({ message: "Senha administrativa inválida." }, 401);
  const url = new URL(request.url);
  const resource = url.searchParams.get("resource") || "reports";

  try {
    if (resource === "evidence") {
      const key = url.searchParams.get("key");
      if (!key) return json({ message: "Evidência inválida." }, 400);
      const store = getStore("report-evidence");
      const blob = await store.get(key, { type: "blob" });
      if (!blob) return json({ message: "Arquivo não encontrado." }, 404);
      const metadata = await store.getMetadata(key);
      return new Response(blob, { headers: { "Content-Type": metadata?.type || blob.type || "application/octet-stream" } });
    }

    if (resource === "people") {
      if (request.method === "GET") return json({ people: await getPeople() });
      const { name } = await request.json();
      if (typeof name !== "string" || !name.trim() || name.length > 100) return json({ message: "Nome inválido." }, 400);
      const people = await getPeople();
      const normalized = name.trim();
      const updated = request.method === "DELETE" ? people.filter((item) => item !== normalized) : [...new Set([...people, normalized])];
      const clearRange = encodeURIComponent("'Pessoas'!A2:A");
      await googleFetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${clearRange}:clear`, { method: "POST", body: "{}" });
      if (updated.length) {
        await googleFetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${clearRange}?valueInputOption=RAW`, { method: "PUT", body: JSON.stringify({ values: updated.map((item) => [item]) }) });
      }
      return json({ people: updated });
    }

    if (resource === "evaluation" && request.method === "POST") {
      const { protocol, accepted, points } = await request.json();
      const validPoints = accepted === true && (points === -2 || points === -3);
      if (typeof protocol !== "string" || (!validPoints && accepted !== false)) {
        return json({ message: "Avaliação inválida." }, 400);
      }

      const sheets = await getSheets();
      const configured = Netlify.env.get("GOOGLE_SHEET_NAME")?.trim();
      const title = configured || sheets.find(({ properties }) => properties.title === "Denuncias")?.properties.title || sheets.find(({ properties }) => properties.title !== "Pessoas")?.properties.title;
      if (!title) throw publicError("A aba de denúncias não foi encontrada.");
      const escapedTitle = title.replaceAll("'", "''");
      const protocolRange = encodeURIComponent(`'${escapedTitle}'!A2:A`);
      const protocolsResponse = await googleFetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${protocolRange}`);
      const protocols = ((await protocolsResponse.json()).values || []).flat();
      const index = protocols.indexOf(protocol);
      if (index < 0) return json({ message: "Denúncia não encontrada." }, 404);

      const status = accepted ? "Aceitável" : "Não aceitável";
      const savedPoints = accepted ? points : 0;
      const row = index + 2;
      const headerRange = encodeURIComponent(`'${escapedTitle}'!F1:G1`);
      await googleFetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${headerRange}?valueInputOption=RAW`, {
        method: "PUT",
        body: JSON.stringify({ values: [["Status", "Pontos"]] }),
      });
      const evaluationRange = encodeURIComponent(`'${escapedTitle}'!F${row}:G${row}`);
      await googleFetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${evaluationRange}?valueInputOption=RAW`, {
        method: "PUT",
        body: JSON.stringify({ values: [[status, savedPoints]] }),
      });
      return json({ protocol, status, points: savedPoints });
    }

    return json({ reports: await getReports() });
  } catch (error) {
    console.error("Admin error:", error.message);
    return json({ message: error.isPublic ? error.message : "Não foi possível carregar os dados." }, 500);
  }
};
