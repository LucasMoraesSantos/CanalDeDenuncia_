const state = {
  password: sessionStorage.getItem("admin-password") || "",
  reports: [],
  people: [],
  objectUrl: null,
};
const $ = (selector) => document.querySelector(selector);

const api = async (resource, options = {}) => {
  const response = await fetch(`/.netlify/functions/admin?resource=${resource}`, {
    ...options,
    headers: { "x-admin-password": state.password, ...options.headers },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.message || "Não foi possível concluir a solicitação.");
  }
  return response;
};

const escapeHtml = (value) => {
  const span = document.createElement("span");
  span.textContent = value;
  return span.innerHTML;
};

const getFilteredReports = () => {
  const search = $("#search").value.toLowerCase();
  const person = $("#person-filter").value;
  const from = $("#date-from").value;
  const to = $("#date-to").value;
  return state.reports.filter((item) => {
    const day = item.date.slice(0, 10);
    return (
      (!search || `${item.protocol} ${item.description}`.toLowerCase().includes(search)) &&
      (!person || item.person === person) &&
      (!from || day >= from) &&
      (!to || day <= to)
    );
  });
};

const updateMetrics = (filtered = getFilteredReports()) => {
  $("#total").textContent = state.reports.length;
  $("#filtered-total").textContent = filtered.length;
  $("#negative-points").textContent = filtered.reduce((sum, item) => sum + item.points, 0);
  $("#people-count").textContent = state.people.length;
  $("#evidence-count").textContent = state.reports.filter((item) => item.evidence.length).length;
};

const renderFilters = () => {
  const current = $("#person-filter").value;
  $("#person-filter").innerHTML = '<option value="">Todas</option>';
  state.people.forEach((name) => $("#person-filter").add(new Option(name, name)));
  $("#person-filter").value = current;
};

const renderReports = () => {
  const filtered = getFilteredReports();
  $("#empty").hidden = filtered.length > 0;
  $("#reports").innerHTML = filtered
    .map((item) => {
      const statusClass = item.status === "Aceitável" ? "accepted" : item.status ? "rejected" : "pending";
      const status = item.status || "Pendente";
      return `<article class="report">
        <div class="report-head"><h2>${escapeHtml(item.protocol)}</h2><time>${new Date(item.date).toLocaleString("pt-BR")}</time></div>
        <div class="report-tags"><span class="person">${escapeHtml(item.person)}</span><span class="status ${statusClass}">${status}${item.points ? ` · ${item.points} pontos` : ""}</span></div>
        <p class="description">${escapeHtml(item.description)}</p>
        <div class="evidence-grid">${item.evidence.map((file) => `<button class="evidence" data-key="${escapeHtml(file.key || "")}" data-type="${escapeHtml(file.type || "")}" ${file.key ? "" : "disabled"}>${escapeHtml(file.name)}</button>`).join("")}</div>
        <div class="evaluation" data-protocol="${escapeHtml(item.protocol)}">
          <span>Esta denúncia é aceitável?</span>
          <button data-accepted="false" data-points="0">Não aceitável</button>
          <button data-accepted="true" data-points="-2">Aceitável · -2</button>
          <button data-accepted="true" data-points="-3">Aceitável · -3</button>
        </div>
      </article>`;
    })
    .join("");
  updateMetrics(filtered);
};

const renderPeople = () => {
  $("#people-list").innerHTML = state.people
    .map((name) => `<li><span>${escapeHtml(name)}</span><button data-name="${escapeHtml(name)}">Remover</button></li>`)
    .join("");
};

const loadData = async () => {
  const [reportsResponse, peopleResponse] = await Promise.all([api("reports"), api("people")]);
  state.reports = (await reportsResponse.json()).reports;
  state.people = (await peopleResponse.json()).people;
  renderPeople();
  renderFilters();
  renderReports();
};

const refreshData = async () => {
  const button = $("#refresh");
  const label = $("#refresh-label");
  button.disabled = true;
  button.classList.add("loading");
  label.textContent = "Atualizando...";
  try {
    await loadData();
    label.textContent = "Atualizado";
    window.setTimeout(() => {
      label.textContent = "Atualizar";
    }, 1500);
  } catch (error) {
    label.textContent = "Tentar novamente";
    alert(error.message);
  } finally {
    button.disabled = false;
    button.classList.remove("loading");
  }
};

$("#login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  state.password = $("#password").value;
  try {
    await loadData();
    sessionStorage.setItem("admin-password", state.password);
    $("#login-view").hidden = true;
    $("#dashboard").hidden = false;
  } catch (error) {
    $("#login-error").textContent = error.message;
  }
});
if (state.password) {
  $("#password").value = state.password;
  $("#login-form").requestSubmit();
}

$("#logout").addEventListener("click", () => {
  sessionStorage.clear();
  location.reload();
});
$("#refresh").addEventListener("click", refreshData);
document.querySelectorAll(".tab").forEach((button) =>
  button.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab === button));
    $("#reports-panel").hidden = button.dataset.tab !== "reports";
    $("#people-panel").hidden = button.dataset.tab !== "people";
  }),
);
[$("#search"), $("#person-filter"), $("#date-from"), $("#date-to")].forEach((input) =>
  input.addEventListener("input", renderReports),
);

$("#person-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = $("#new-person").value.trim();
  const response = await api("people", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
  state.people = (await response.json()).people;
  $("#new-person").value = "";
  renderPeople();
  renderFilters();
  updateMetrics();
});

$("#people-list").addEventListener("click", async (event) => {
  const name = event.target.dataset.name;
  if (!name || !confirm(`Remover ${name}?`)) return;
  const response = await api("people", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
  state.people = (await response.json()).people;
  renderPeople();
  renderFilters();
  updateMetrics();
});

$("#reports").addEventListener("click", async (event) => {
  const evaluationButton = event.target.closest(".evaluation button");
  if (evaluationButton) {
    const container = evaluationButton.closest(".evaluation");
    container.querySelectorAll("button").forEach((button) => (button.disabled = true));
    try {
      const response = await api("evaluation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          protocol: container.dataset.protocol,
          accepted: evaluationButton.dataset.accepted === "true",
          points: Number(evaluationButton.dataset.points),
        }),
      });
      const updated = await response.json();
      const report = state.reports.find((item) => item.protocol === updated.protocol);
      Object.assign(report, { status: updated.status, points: updated.points });
      renderReports();
    } catch (error) {
      alert(error.message);
      container.querySelectorAll("button").forEach((button) => (button.disabled = false));
    }
    return;
  }

  const button = event.target.closest("[data-key]");
  if (!button?.dataset.key) return;
  const response = await api(`evidence&key=${encodeURIComponent(button.dataset.key)}`);
  const blob = await response.blob();
  if (state.objectUrl) URL.revokeObjectURL(state.objectUrl);
  state.objectUrl = URL.createObjectURL(blob);
  $("#viewer-content").innerHTML = button.dataset.type.startsWith("image/")
    ? `<img src="${state.objectUrl}" alt="Evidência" />`
    : `<iframe src="${state.objectUrl}" title="Evidência"></iframe>`;
  $("#viewer").showModal();
});

$("#close-viewer").addEventListener("click", () => $("#viewer").close());
