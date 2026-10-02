const description = document.querySelector("#description");
const characterCount = document.querySelector("#character-count");
const evidenceInput = document.querySelector("#evidence");
const dropZone = document.querySelector("#drop-zone");
const fileList = document.querySelector("#file-list");
const form = document.querySelector("#report-form");
const toast = document.querySelector("#toast");
const toastIcon = document.querySelector("#toast-icon");
const toastTitle = document.querySelector("#toast-title");
const toastMessage = document.querySelector("#toast-message");
const submitButton = document.querySelector("#submit-button");
const submitLabel = document.querySelector("#submit-label");
const personSelect = document.querySelector("#person");

const loadPeople = async () => {
  try {
    const response = await fetch("/.netlify/functions/people");
    if (!response.ok) return;
    const { people } = await response.json();
    const placeholder = personSelect.options[0];
    personSelect.replaceChildren(placeholder);
    people.forEach((person) => personSelect.add(new Option(person, person)));
  } catch {
    // A lista presente no HTML continua disponível como fallback.
  }
};

loadPeople();

description.addEventListener("input", () => {
  characterCount.textContent = `${description.value.length} / 1500`;
});

const formatSize = (bytes) => {
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const allowedImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

const showFiles = (files) => {
  fileList.replaceChildren();
  [...files].forEach((file) => {
    const item = document.createElement("li");
    const name = document.createElement("span");
    const size = document.createElement("span");
    name.textContent = file.name;
    size.textContent = formatSize(file.size);
    item.append(name, size);
    fileList.append(item);
  });
};

evidenceInput.addEventListener("change", () => {
  dropZone.classList.remove("invalid");
  evidenceInput.setCustomValidity("");
  showFiles(evidenceInput.files);
});

evidenceInput.addEventListener("invalid", () => {
  dropZone.classList.add("invalid");
  evidenceInput.setCustomValidity("Anexe pelo menos uma imagem para enviar a denúncia.");
  showToast({
    title: "Evidência obrigatória.",
    message: "Anexe pelo menos uma imagem JPG, PNG ou WEBP.",
    error: true,
  });
});

["dragenter", "dragover"].forEach((eventName) => {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.add("dragging");
  });
});

["dragleave", "drop"].forEach((eventName) => {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.remove("dragging");
  });
});

dropZone.addEventListener("drop", (event) => {
  evidenceInput.files = event.dataTransfer.files;
  showFiles(evidenceInput.files);
});

let toastTimer;

const showToast = ({ title, message, error = false }) => {
  window.clearTimeout(toastTimer);
  toast.classList.toggle("error", error);
  toastIcon.textContent = error ? "!" : "✓";
  toastTitle.textContent = title;
  toastMessage.textContent = message;
  toast.classList.add("show");
  toastTimer = window.setTimeout(() => toast.classList.remove("show"), 5000);
};

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const evidenceFiles = [...evidenceInput.files];
  if (evidenceFiles.length === 0) {
    showToast({
      title: "Imagem obrigatória.",
      message: "Anexe pelo menos uma imagem para enviar a denúncia.",
      error: true,
    });
    evidenceInput.click();
    return;
  }
  if (evidenceFiles.some((file) => !allowedImageTypes.has(file.type))) {
    showToast({
      title: "Formato inválido.",
      message: "Envie somente imagens JPG, PNG ou WEBP.",
      error: true,
    });
    return;
  }

  submitButton.disabled = true;
  submitLabel.textContent = "Enviando...";

  try {
    const payload = new FormData();
    payload.append("person", form.elements.person.value);
    payload.append("description", form.elements.description.value);
    evidenceFiles.forEach((file) => payload.append("evidence", file));
    const response = await fetch("/.netlify/functions/submit-report", {
      method: "POST",
      body: payload,
    });
    const result = await response.json();

    if (!response.ok) throw new Error(result.message || "Não foi possível enviar a denúncia.");

    showToast({
      title: "Denúncia enviada.",
      message: `Guarde o protocolo ${result.protocol}.`,
    });
    form.reset();
    fileList.replaceChildren();
    characterCount.textContent = "0 / 1500";
  } catch (error) {
    showToast({
      title: "Falha no envio.",
      message: error.message,
      error: true,
    });
  } finally {
    submitButton.disabled = false;
    submitLabel.textContent = "Enviar denúncia";
  }
});
