const description = document.querySelector("#description");
const characterCount = document.querySelector("#character-count");
const evidenceInput = document.querySelector("#evidence");
const dropZone = document.querySelector("#drop-zone");
const fileList = document.querySelector("#file-list");
const form = document.querySelector("#report-form");
const toast = document.querySelector("#toast");

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

form.addEventListener("submit", (event) => {
  event.preventDefault();
  toast.classList.add("show");
  window.setTimeout(() => toast.classList.remove("show"), 3500);
});
