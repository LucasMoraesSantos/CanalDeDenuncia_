import { getAccessToken, SHEET_ID } from "./submit-report.mjs";

const FALLBACK_PEOPLE = ["Lucas", "João G.", "Marcela", "Agnys", "Maju", "Isabella", "Peterson", "Herick"];

export default async () => {
  try {
    const token = await getAccessToken();
    const range = encodeURIComponent("'Pessoas'!A2:A");
    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${range}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );

    if (!response.ok) return Response.json({ people: FALLBACK_PEOPLE });
    const result = await response.json();
    const people = (result.values || []).flat().map((name) => name.trim()).filter(Boolean);
    return Response.json({ people });
  } catch (error) {
    console.error("People list error:", error.message);
    return Response.json({ people: FALLBACK_PEOPLE });
  }
};
