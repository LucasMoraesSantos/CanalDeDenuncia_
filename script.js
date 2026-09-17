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

description.addEventListener("input", () => {
  characterCount.textContent = `${description.value.length} / 1500`;
});

const formatSize = (bytes) => {
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

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

evidenceInput.addEventListener("change", () => showFiles(evidenceInput.files));

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

  submitButton.disabled = true;
  submitLabel.textContent = "Enviando...";

  try {
    const response = await fetch("/.netlify/functions/submit-report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        person: form.elements.person.value,
        description: form.elements.description.value,
        evidenceNames: [...evidenceInput.files].map((file) => file.name),
      }),
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
