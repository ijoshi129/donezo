const API_BASE = "/api/tasks";
const SWIPE_TRIGGER_RATIO = 0.28;
const HORIZONTAL_LOCK_PX = 8;
const SWIPE_COMMIT_MS = 290;
const SWIPE_COMMIT_MIN_MS = 180;
const SWIPE_COMMIT_MAX_MS = 360;
const DELETE_ANIMATION_MS = 260;
const GROUP_MOVE_MS = 360;
const MAX_IMAGE_EDGE = 1600;
const IMAGE_QUALITY = 0.82;
const UNDO_WINDOW_MS = 5000;

const elements = {
  composer: document.querySelector("#composer"),
  editCancel: document.querySelector("#edit-cancel"),
  editForm: document.querySelector("#edit-form"),
  editImage: document.querySelector("#edit-image"),
  editImagePreview: document.querySelector("#edit-image-preview"),
  editImageRemove: document.querySelector("#edit-image-remove"),
  editTitle: document.querySelector("#edit-title"),
  editDue: document.querySelector("#edit-due"),
  editDueClear: document.querySelector("#edit-due-clear"),
  tagEditor: document.querySelector("#tag-editor"),
  tagEditorList: document.querySelector("#tag-editor-list"),
  tagInput: document.querySelector("#tag-input"),
  duePicker: document.querySelector("#due-picker"),
  taskDue: document.querySelector("#task-due"),
  newDueChip: document.querySelector("#new-due-chip"),
  newDueLabel: document.querySelector("#new-due-label"),
  newDueRemove: document.querySelector("#new-due-remove"),
  empty: document.querySelector("#empty-state"),
  fab: document.querySelector("#fab"),
  form: document.querySelector("#task-form"),
  imageInput: document.querySelector("#task-image"),
  lightbox: document.querySelector("#image-lightbox"),
  lightboxImage: document.querySelector("#lightbox-image"),
  input: document.querySelector("#task-input"),
  list: document.querySelector("#task-list"),
  modal: document.querySelector("#task-modal"),
  modalClose: document.querySelector("#modal-close"),
  newImagePreview: document.querySelector("#new-image-preview"),
  newImageRemove: document.querySelector("#new-image-remove"),
  progress: document.querySelector("#progress-fill"),
  remaining: document.querySelector("#remaining-count"),
  complete: document.querySelector("#complete-count"),
  searchInput: document.querySelector("#search-input"),
  searchPanel: document.querySelector("#search-panel"),
  searchToggle: document.querySelector("#search-toggle"),
  settingsToggle: document.querySelector("#settings-toggle"),
  settingsModal: document.querySelector("#settings-modal"),
  settingsClose: document.querySelector("#settings-close"),
  settingAutoClear: document.querySelector("#setting-auto-clear"),
  template: document.querySelector("#task-template"),
  toastRegion: document.querySelector("#toast-region"),
};

let tasks = [];
let filter = "";
let isSaving = false;
let pendingImage = null;
let editingTaskId = null;
let editingImage = null;
let pendingDueDate = null;
let editingDueDate = null;
let editingTags = [];
let pendingDelete = null;
const pendingDeleteIds = new Set();
let settings = { autoClearNoon: true };

render();
hydrateTasks();
loadSettings();
scheduleNextNoonRefresh();
registerServiceWorker();

elements.form.addEventListener("submit", (event) => {
  event.preventDefault();
  addTask(elements.input.value, pendingImage);
});

elements.fab.addEventListener("click", () => {
  elements.composer.classList.add("is-open");
  elements.input.focus();
});

elements.searchToggle.addEventListener("click", () => {
  elements.searchPanel.classList.toggle("is-open");
  if (elements.searchPanel.classList.contains("is-open")) {
    elements.searchInput.focus();
  } else {
    elements.searchInput.value = "";
    filter = "";
    render();
  }
});

elements.searchInput.addEventListener("input", () => {
  filter = elements.searchInput.value.trim().toLowerCase();
  render();
});

elements.settingsToggle.addEventListener("click", () => {
  elements.settingAutoClear.checked = settings.autoClearNoon;
  elements.settingsModal.showModal();
});

elements.settingsClose.addEventListener("click", () => elements.settingsModal.close());

elements.settingsModal.addEventListener("click", (event) => {
  if (event.target === elements.settingsModal) elements.settingsModal.close();
});

elements.settingAutoClear.addEventListener("change", () => {
  updateSetting({ autoClearNoon: elements.settingAutoClear.checked });
});

elements.imageInput.addEventListener("change", async () => {
  pendingImage = await readImageFile(elements.imageInput.files?.[0]);
  renderImagePreview(elements.newImagePreview, pendingImage);
});

elements.newImageRemove.addEventListener("click", () => {
  pendingImage = null;
  elements.imageInput.value = "";
  renderImagePreview(elements.newImagePreview, null);
});

elements.duePicker.addEventListener("click", () => {
  elements.composer.classList.add("is-open");
  openDatePicker(elements.taskDue);
});

elements.taskDue.addEventListener("change", () => {
  pendingDueDate = elements.taskDue.value || null;
  renderComposerDue();
});

elements.newDueRemove.addEventListener("click", () => {
  pendingDueDate = null;
  elements.taskDue.value = "";
  renderComposerDue();
});

elements.editImage.addEventListener("change", async () => {
  editingImage = await readImageFile(elements.editImage.files?.[0]);
  renderImagePreview(elements.editImagePreview, editingImage);
});

elements.editImageRemove.addEventListener("click", () => {
  editingImage = null;
  elements.editImage.value = "";
  renderImagePreview(elements.editImagePreview, null);
});

elements.editDue.addEventListener("change", () => {
  editingDueDate = elements.editDue.value || null;
});

elements.editDueClear.addEventListener("click", () => {
  editingDueDate = null;
  elements.editDue.value = "";
});

elements.tagInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === ",") {
    event.preventDefault();
    addEditingTag(elements.tagInput.value);
    elements.tagInput.value = "";
  } else if (event.key === "Backspace" && !elements.tagInput.value && editingTags.length) {
    editingTags = editingTags.slice(0, -1);
    renderTagEditor();
  }
});

elements.tagEditor.addEventListener("click", (event) => {
  if (event.target === elements.tagEditor || event.target === elements.tagEditorList) {
    elements.tagInput.focus();
  }
});

elements.editForm.addEventListener("submit", (event) => {
  event.preventDefault();
  saveTaskEdit();
});

elements.editCancel.addEventListener("click", closeEditModal);
elements.modalClose.addEventListener("click", closeEditModal);

elements.modal.addEventListener("click", (event) => {
  if (event.target === elements.modal) closeEditModal();
});
elements.modal.addEventListener("close", resetEditState);

elements.lightbox.addEventListener("click", (event) => {
  if (event.target === elements.lightbox) closeLightbox();
});
elements.lightbox.addEventListener("close", resetLightboxState);

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    // Lock in a pending delete before the tab is backgrounded/closed.
    flushPendingDelete();
  } else {
    hydrateTasks({ quiet: true });
  }
});

window.addEventListener("pagehide", flushPendingDelete);

async function hydrateTasks(options = {}) {
  try {
    const data = await apiRequest(API_BASE);
    const incoming = Array.isArray(data.tasks) ? data.tasks : [];
    // Don't let a task that's mid-undo reappear from a server refresh.
    tasks = incoming.filter((task) => !pendingDeleteIds.has(task.id));
    render();
  } catch {
    if (!options.quiet) {
      elements.empty.textContent = "Tasks could not be loaded.";
      elements.empty.classList.add("is-visible");
    }
  }
}

async function loadSettings() {
  try {
    const data = await apiRequest("/api/settings");
    if (data.settings) settings = { ...settings, ...data.settings };
  } catch {
    // Keep defaults if settings can't be loaded.
  }
}

async function updateSetting(patch) {
  const previous = settings;
  settings = { ...settings, ...patch };
  try {
    const data = await apiRequest("/api/settings", { method: "PATCH", body: patch });
    if (data.settings) settings = { ...settings, ...data.settings };
  } catch {
    settings = previous;
    elements.settingAutoClear.checked = settings.autoClearNoon;
  }
}

async function addTask(title, image = null) {
  const cleanTitle = title.trim();
  if (!cleanTitle || isSaving) return;

  const dueDate = pendingDueDate;
  const tempTask = {
    id: `pending-${Date.now()}`,
    title: cleanTitle,
    image,
    dueDate,
    completed: false,
    createdAt: Date.now(),
    completedAt: null,
  };

  isSaving = true;
  tasks = [tempTask, ...tasks];
  elements.input.value = "";
  elements.imageInput.value = "";
  pendingImage = null;
  pendingDueDate = null;
  elements.taskDue.value = "";
  renderImagePreview(elements.newImagePreview, null);
  renderComposerDue();
  elements.composer.classList.remove("is-open");
  render();

  try {
    const data = await apiRequest(API_BASE, {
      method: "POST",
      body: { title: cleanTitle, image, dueDate },
    });
    tasks = tasks.map((task) => (task.id === tempTask.id ? data.task : task));
    render();
  } catch {
    tasks = tasks.filter((task) => task.id !== tempTask.id);
    elements.composer.classList.add("is-open");
    elements.input.value = cleanTitle;
    pendingImage = image;
    pendingDueDate = dueDate;
    elements.taskDue.value = dueDate || "";
    renderImagePreview(elements.newImagePreview, image);
    renderComposerDue();
    render();
  } finally {
    isSaving = false;
  }
}

async function toggleTask(id, forceComplete, node = null) {
  const previousTasks = tasks;
  const current = tasks.find((task) => task.id === id);
  if (!current) return;

  const completed = typeof forceComplete === "boolean" ? forceComplete : !current.completed;
  const previousRects = getTaskRects();

  tasks = tasks.map((task) => {
    if (task.id !== id) return task;
    return {
      ...task,
      completed,
      completedAt: completed ? Date.now() : null,
    };
  });
  render({ previousRects });

  try {
    const data = await apiRequest(`${API_BASE}/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: { completed },
    });
    tasks = tasks.map((task) => (task.id === id ? data.task : task));
    render();
  } catch {
    tasks = previousTasks;
    render();
  }
}

async function deleteTask(id, node) {
  const task = tasks.find((item) => item.id === id);
  if (!task) return;

  // A pending-deleted task that hasn't been saved yet can just disappear.
  if (id.startsWith("pending-")) {
    tasks = tasks.filter((item) => item.id !== id);
    render();
    return;
  }

  // Any earlier undo offer is now locked in before we queue this one.
  flushPendingDelete();

  if (node) {
    node.classList.add("is-removing");
    await delay(DELETE_ANIMATION_MS);
  }

  pendingDeleteIds.add(id);
  tasks = tasks.filter((item) => item.id !== id);
  render();

  const timer = window.setTimeout(() => commitDelete(id), UNDO_WINDOW_MS);
  pendingDelete = { task, timer };

  showToast({
    message: `Deleted "${task.title}"`,
    actionLabel: "Undo",
    duration: UNDO_WINDOW_MS,
    onAction: () => undoDelete(id),
  });
}

function undoDelete(id) {
  if (!pendingDelete || pendingDelete.task.id !== id) return;
  window.clearTimeout(pendingDelete.timer);
  const { task } = pendingDelete;
  pendingDelete = null;
  pendingDeleteIds.delete(id);
  tasks = [task, ...tasks.filter((item) => item.id !== id)];
  render();
}

async function commitDelete(id) {
  if (!pendingDelete || pendingDelete.task.id !== id) return;
  const { task } = pendingDelete;
  window.clearTimeout(pendingDelete.timer);
  pendingDelete = null;

  try {
    await apiRequest(`${API_BASE}/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  } catch {
    // Restore on failure so the task is never silently lost.
    tasks = [task, ...tasks.filter((item) => item.id !== id)];
    render();
  } finally {
    pendingDeleteIds.delete(id);
  }
}

// Commit any outstanding delete immediately (e.g. before a new delete or on exit).
function flushPendingDelete() {
  if (pendingDelete) commitDelete(pendingDelete.task.id);
}

async function saveTaskEdit() {
  const id = editingTaskId;
  const cleanTitle = elements.editTitle.value.trim();
  const nextImage = editingImage;
  const nextDueDate = editingDueDate;
  // Commit any tag still typed in the input but not yet turned into a chip.
  if (elements.tagInput.value.trim()) {
    addEditingTag(elements.tagInput.value);
    elements.tagInput.value = "";
  }
  const nextTags = [...editingTags];
  if (!id || !cleanTitle || isSaving) return;

  const previousTasks = tasks;
  isSaving = true;
  tasks = tasks.map((task) => (
    task.id === id
      ? { ...task, title: cleanTitle, image: nextImage, dueDate: nextDueDate, tags: nextTags }
      : task
  ));
  closeEditModal();
  render();

  try {
    const data = await apiRequest(`${API_BASE}/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: { title: cleanTitle, image: nextImage, dueDate: nextDueDate, tags: nextTags },
    });
    tasks = tasks.map((task) => (task.id === id ? data.task : task));
    render();
  } catch {
    tasks = previousTasks;
    render();
  } finally {
    isSaving = false;
  }
}

function render(options = {}) {
  const sortedTasks = sortTasks(tasks);
  const visibleTasks = filter
    ? sortedTasks.filter((task) => matchesFilter(task, filter))
    : sortedTasks;

  elements.list.replaceChildren();
  const openTasks = visibleTasks.filter((task) => !task.completed);
  const doneTasks = visibleTasks.filter((task) => task.completed);
  for (const task of openTasks) {
    elements.list.append(createTaskNode(task));
  }
  if (openTasks.length && doneTasks.length) {
    elements.list.append(createTaskDivider());
  }
  for (const task of doneTasks) {
    elements.list.append(createTaskNode(task));
  }
  if (options.previousRects) {
    animateTaskPositions(options.previousRects);
  }

  const total = tasks.length;
  const completed = tasks.filter((task) => task.completed).length;
  const remaining = total - completed;
  elements.remaining.textContent = `${remaining} left`;
  elements.complete.textContent = `${completed} done`;
  elements.progress.style.width = total ? `${Math.round((completed / total) * 100)}%` : "0";
  elements.empty.classList.toggle("is-visible", visibleTasks.length === 0);
  elements.empty.textContent = filter ? "No matching tasks." : "Nothing due.";
}

function createTaskNode(task) {
  const node = elements.template.content.firstElementChild.cloneNode(true);
  const surface = node.querySelector(".task-surface");
  const title = node.querySelector(".task-title");
  const check = node.querySelector(".task-check");
  const edit = node.querySelector(".task-edit");
  const imageButton = node.querySelector(".task-image-button");
  const image = imageButton.querySelector("img");
  const remove = node.querySelector(".task-delete");

  const due = node.querySelector(".task-due");
  const dueLabel = due.querySelector(".task-due-label");

  node.dataset.id = task.id;
  node.classList.toggle("is-complete", task.completed);
  node.classList.toggle("is-pending", task.id.startsWith("pending-"));
  node.classList.toggle("has-image", Boolean(task.image));
  title.textContent = task.title;

  const dueInfo = describeDue(task.dueDate);
  if (dueInfo) {
    due.hidden = false;
    due.classList.toggle("is-overdue", !task.completed && dueInfo.tone === "overdue");
    due.classList.toggle("is-today", !task.completed && dueInfo.tone === "today");
    due.classList.toggle("is-soon", !task.completed && dueInfo.tone === "soon");
    dueLabel.textContent = dueInfo.label;
  }

  const tagsHost = node.querySelector(".task-tags");
  for (const tag of Array.isArray(task.tags) ? task.tags : []) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "task-tag";
    chip.textContent = `#${tag}`;
    chip.addEventListener("click", () => filterByTag(tag));
    tagsHost.append(chip);
  }
  check.setAttribute("aria-label", task.completed ? "Mark incomplete" : "Mark complete");
  if (task.image) {
    image.src = task.image;
    image.alt = task.title;
    imageButton.hidden = false;
  }

  check.addEventListener("click", () => toggleTask(task.id, undefined, node));
  edit.addEventListener("click", () => openEditModal(task));
  imageButton.addEventListener("click", () => {
    const swipedAt = Number(node.dataset.swipedAt || 0);
    if (Date.now() - swipedAt < 450) return;
    openLightbox(task);
  });
  remove.addEventListener("click", () => deleteTask(task.id, node));
  wireSwipe(node, surface, task.id);

  return node;
}

function createTaskDivider() {
  const divider = document.createElement("div");
  divider.className = "task-divider";
  divider.setAttribute("role", "separator");
  divider.innerHTML = "<span>Done</span>";
  return divider;
}

function getTaskRects() {
  const rects = new Map();
  for (const node of elements.list.querySelectorAll(".task-card[data-id]")) {
    rects.set(node.dataset.id, node.getBoundingClientRect());
  }
  return rects;
}

function animateTaskPositions(previousRects) {
  for (const node of elements.list.querySelectorAll(".task-card[data-id]")) {
    const previous = previousRects.get(node.dataset.id);
    if (!previous) continue;

    const current = node.getBoundingClientRect();
    const dx = previous.left - current.left;
    const dy = previous.top - current.top;
    if (!dx && !dy) continue;

    node.style.transition = "none";
    node.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
    node.classList.add("is-reordering");
    node.getBoundingClientRect();

    requestAnimationFrame(() => {
      node.style.transition = `transform ${GROUP_MOVE_MS}ms cubic-bezier(0.16, 1, 0.3, 1)`;
      node.style.transform = "";
      window.setTimeout(() => {
        node.style.transition = "";
        node.classList.remove("is-reordering");
      }, GROUP_MOVE_MS + 40);
    });
  }
}

function openEditModal(task) {
  editingTaskId = task.id;
  editingImage = task.image || null;
  editingDueDate = task.dueDate || null;
  editingTags = Array.isArray(task.tags) ? [...task.tags] : [];
  elements.editTitle.value = task.title;
  elements.editImage.value = "";
  elements.editDue.value = task.dueDate || "";
  elements.tagInput.value = "";
  renderTagEditor();
  renderImagePreview(elements.editImagePreview, editingImage);
  elements.modal.showModal();
  elements.editTitle.focus();
  elements.editTitle.select();
}

function closeEditModal() {
  elements.modal.close();
}

function resetEditState() {
  editingTaskId = null;
  editingImage = null;
  editingDueDate = null;
  editingTags = [];
  elements.editImage.value = "";
  elements.editDue.value = "";
  elements.tagInput.value = "";
  renderTagEditor();
}

function openLightbox(task) {
  if (!task.image) return;
  elements.lightboxImage.src = task.image;
  elements.lightboxImage.alt = task.title;
  elements.lightbox.showModal();
}

function closeLightbox() {
  elements.lightbox.close();
}

function resetLightboxState() {
  elements.lightboxImage.removeAttribute("src");
  elements.lightboxImage.alt = "";
}

function wireSwipe(node, surface, id) {
  let startX = 0;
  let startY = 0;
  let currentX = 0;
  let width = 0;
  let isPointerDown = false;
  let isHorizontalSwipe = false;
  let pointerId = null;
  let frame = null;

  node.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    const interactive = event.target.closest("button, input, label");
    if (interactive && !interactive.classList.contains("task-image-button")) return;
    pointerId = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;
    currentX = 0;
    width = node.getBoundingClientRect().width;
    isPointerDown = true;
    isHorizontalSwipe = false;
    node.setPointerCapture(pointerId);
  });

  node.addEventListener("pointermove", (event) => {
    if (!isPointerDown || event.pointerId !== pointerId) return;

    const coalescedEvents = event.getCoalescedEvents?.();
    const sample = coalescedEvents?.[coalescedEvents.length - 1] || event;
    const dx = sample.clientX - startX;
    const dy = sample.clientY - startY;

    if (!isHorizontalSwipe) {
      if (Math.abs(dx) < HORIZONTAL_LOCK_PX && Math.abs(dy) < HORIZONTAL_LOCK_PX) return;
      if (Math.abs(dy) > Math.abs(dx)) {
        endSwipe({ reset: true });
        return;
      }
      isHorizontalSwipe = true;
      node.dataset.swipedAt = String(Date.now());
      node.classList.add("is-dragging");
      document.body.classList.add("is-swiping");
    }

    if (event.cancelable) {
      event.preventDefault();
    }
    currentX = Math.max(-width, Math.min(width, dx));
    queueSwipeFrame();
  }, { passive: false });

  node.addEventListener("pointerup", finishPointer);
  node.addEventListener("pointercancel", () => endSwipe({ reset: true }));

  function finishPointer(event) {
    if (event.pointerId !== pointerId) return;
    if (isHorizontalSwipe) {
      node.dataset.swipedAt = String(Date.now());
    }
    const trigger = Math.min(132, Math.max(64, width * SWIPE_TRIGGER_RATIO));
    const shouldToggle = currentX >= trigger;
    const shouldDelete = currentX <= -trigger;

    if (shouldToggle || shouldDelete) {
      const current = tasks.find((task) => task.id === id);
      const direction = shouldToggle ? 1 : -1;
      const targetX = direction * width;
      const commitMs = getSwipeCommitDuration(currentX, targetX);
      node.classList.toggle("show-complete", shouldToggle);
      node.classList.toggle("show-delete", shouldDelete);
      if (frame) {
        cancelAnimationFrame(frame);
        frame = null;
      }
      surface.style.transform = `translate3d(${currentX}px, 0, 0)`;
      surface.getBoundingClientRect();
      finishSwipeGesture();
      surface.style.setProperty("--swipe-commit-ms", `${commitMs}ms`);
      node.classList.add("is-committing");

      requestAnimationFrame(() => {
        surface.style.transform = `translate3d(${targetX}px, 0, 0)`;
      });

      waitForSwipeCommit(surface, commitMs).then(() => {
        if (shouldToggle) {
          toggleTask(id, current ? !current.completed : true);
        } else {
          deleteTask(id, node);
        }
      });
      return;
    }

    endSwipe({ reset: true });
  }

  function queueSwipeFrame() {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = null;
      surface.style.transform = `translate3d(${currentX}px, 0, 0)`;
      node.classList.toggle("show-complete", currentX > 0);
      node.classList.toggle("show-delete", currentX < 0);
    });
  }

  function endSwipe({ reset }) {
    if (frame) {
      cancelAnimationFrame(frame);
      frame = null;
    }
    isPointerDown = false;
    isHorizontalSwipe = false;
    node.classList.remove("is-dragging");
    document.body.classList.remove("is-swiping");
    if (reset) {
      node.classList.remove("show-complete", "show-delete");
      surface.style.transform = "";
    }
    if (pointerId !== null && node.hasPointerCapture(pointerId)) {
      node.releasePointerCapture(pointerId);
    }
    pointerId = null;
  }

  function finishSwipeGesture() {
    if (frame) {
      cancelAnimationFrame(frame);
      frame = null;
    }
    isPointerDown = false;
    isHorizontalSwipe = false;
    node.classList.remove("is-dragging");
    document.body.classList.remove("is-swiping");
    if (pointerId !== null && node.hasPointerCapture(pointerId)) {
      node.releasePointerCapture(pointerId);
    }
    pointerId = null;
  }
}

function getSwipeCommitDuration(fromX, toX) {
  const distance = Math.abs(toX - fromX);
  return Math.round(Math.max(
    SWIPE_COMMIT_MIN_MS,
    Math.min(SWIPE_COMMIT_MAX_MS, distance * 0.82),
  ));
}

function waitForSwipeCommit(surface, duration = SWIPE_COMMIT_MS) {
  return new Promise((resolve) => {
    const timeout = window.setTimeout(done, duration + 80);

    function done() {
      window.clearTimeout(timeout);
      surface.removeEventListener("transitionend", handleTransitionEnd);
      resolve();
    }

    function handleTransitionEnd(event) {
      if (event.target === surface && event.propertyName === "transform") {
        done();
      }
    }

    surface.addEventListener("transitionend", handleTransitionEnd);
  });
}

function sortTasks(taskList) {
  return [...taskList].sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    return b.createdAt - a.createdAt;
  });
}

async function readImageFile(file) {
  if (!file) return null;
  if (!file.type.startsWith("image/")) return null;

  const source = await fileToDataUrl(file);
  const image = await loadImage(source);
  const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", IMAGE_QUALITY);
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result));
    reader.addEventListener("error", reject);
    reader.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image));
    image.addEventListener("error", reject);
    image.src = src;
  });
}

function describeDue(dueDate) {
  const due = parseLocalDate(dueDate);
  if (!due) return null;

  const today = startOfToday();
  const diffDays = Math.round((due.getTime() - today.getTime()) / 86_400_000);

  if (diffDays < 0) {
    const days = Math.abs(diffDays);
    return { tone: "overdue", label: days === 1 ? "Yesterday" : `${days}d overdue` };
  }
  if (diffDays === 0) return { tone: "today", label: "Today" };
  if (diffDays === 1) return { tone: "soon", label: "Tomorrow" };
  if (diffDays < 7) {
    return { tone: "soon", label: due.toLocaleDateString(undefined, { weekday: "short" }) };
  }
  const sameYear = due.getFullYear() === today.getFullYear();
  return {
    tone: "later",
    label: due.toLocaleDateString(
      undefined,
      sameYear
        ? { month: "short", day: "numeric" }
        : { month: "short", day: "numeric", year: "numeric" },
    ),
  };
}

function parseLocalDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function normalizeTag(value) {
  return String(value || "").trim().replace(/^#+/, "").toLowerCase().slice(0, 24);
}

function addEditingTag(value) {
  const tag = normalizeTag(value);
  if (!tag || editingTags.includes(tag) || editingTags.length >= 8) return;
  editingTags = [...editingTags, tag];
  renderTagEditor();
}

function renderTagEditor() {
  elements.tagEditorList.replaceChildren();
  for (const tag of editingTags) {
    const chip = document.createElement("span");
    chip.className = "tag-chip";
    chip.append(`#${tag}`);

    const remove = document.createElement("button");
    remove.type = "button";
    remove.setAttribute("aria-label", `Remove tag ${tag}`);
    remove.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>';
    remove.addEventListener("click", () => {
      editingTags = editingTags.filter((item) => item !== tag);
      renderTagEditor();
    });

    chip.append(remove);
    elements.tagEditorList.append(chip);
  }
}

function filterByTag(tag) {
  elements.searchPanel.classList.add("is-open");
  elements.searchInput.value = tag;
  filter = tag.toLowerCase();
  render();
  elements.searchInput.focus();
}

function matchesFilter(task, term) {
  if (task.title.toLowerCase().includes(term)) return true;
  const tags = Array.isArray(task.tags) ? task.tags : [];
  return tags.some((tag) => tag.includes(term));
}

function renderComposerDue() {
  const info = describeDue(pendingDueDate);
  if (!info) {
    elements.newDueChip.hidden = true;
    elements.duePicker.classList.remove("is-active");
    return;
  }
  elements.newDueLabel.textContent = info.label;
  elements.newDueChip.hidden = false;
  elements.duePicker.classList.add("is-active");
}

function openDatePicker(input) {
  if (typeof input.showPicker === "function") {
    try {
      input.showPicker();
      return;
    } catch {
      // Some browsers throw if not user-activated; fall back to focus.
    }
  }
  input.focus();
}

function renderImagePreview(preview, image) {
  const img = preview.querySelector("img");
  if (!image) {
    preview.hidden = true;
    img.removeAttribute("src");
    return;
  }
  img.src = image;
  preview.hidden = false;
}

async function apiRequest(url, options = {}) {
  const response = await fetch(url, {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Request failed");
  }
  return data;
}

function scheduleNextNoonRefresh() {
  const now = new Date();
  const nextNoon = new Date(now);
  nextNoon.setHours(12, 0, 0, 0);
  if (now >= nextNoon) {
    nextNoon.setDate(nextNoon.getDate() + 1);
  }

  window.setTimeout(() => {
    hydrateTasks({ quiet: true });
    scheduleNextNoonRefresh();
  }, nextNoon.getTime() - now.getTime() + 1500);
}

function showToast({ message, actionLabel, onAction, duration = UNDO_WINDOW_MS }) {
  dismissToasts();

  const toast = document.createElement("div");
  toast.className = "toast";
  toast.setAttribute("role", "status");

  const text = document.createElement("span");
  text.className = "toast-message";
  text.textContent = message;
  toast.append(text);

  if (actionLabel && onAction) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "toast-action";
    button.textContent = actionLabel;
    button.addEventListener("click", () => {
      onAction();
      hideToast(toast);
    });
    toast.append(button);
  }

  const timerBar = document.createElement("div");
  timerBar.className = "toast-timer";
  timerBar.style.animationDuration = `${duration}ms`;
  toast.append(timerBar);

  elements.toastRegion.append(toast);
  requestAnimationFrame(() => toast.classList.add("is-visible"));

  const dismissTimer = window.setTimeout(() => hideToast(toast), duration);
  toast.dataset.dismissTimer = String(dismissTimer);
  return toast;
}

function hideToast(toast) {
  if (!toast.isConnected || toast.classList.contains("is-leaving")) return;
  window.clearTimeout(Number(toast.dataset.dismissTimer || 0));
  toast.classList.remove("is-visible");
  toast.classList.add("is-leaving");
  window.setTimeout(() => toast.remove(), 220);
}

function dismissToasts() {
  for (const toast of elements.toastRegion.querySelectorAll(".toast")) {
    hideToast(toast);
  }
}

function delay(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js");
    });
  }
}
