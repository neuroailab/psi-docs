const NS = "http://www.w3.org/2000/svg";
const svg = document.querySelector("#training-timeline");
const detail = document.querySelector("#model-detail");
const detailClose = document.querySelector("#detail-close");
const themeToggle = document.querySelector("#theme-toggle");
const themeLabel = document.querySelector("#theme-label");
const checkpointCopy = document.querySelector("#checkpoint-copy");

const chart = {
  minStep: 450_000,
  maxStep: 1_700_000,
  left: 280,
  right: 1660,
  axisY: 90,
};

const lanes = {
  pre: {
    label: "PRE-TRAINING",
    description: "FOUNDATION + CONTINUAL PRE-TRAINING",
    top: 122,
    bottom: 334,
  },
  mid: {
    label: "MID-TRAINING",
    description: "CONTEXT + SPECIALIST TRAINING",
    top: 346,
    bottom: 588,
  },
  post: {
    label: "POST-TRAINING",
    description: "TASK-SPECIFIC POST-TRAINING",
    top: 600,
    bottom: 818,
  },
};

// Kept only as a resilient fallback for direct file:// previews.
// Edit models.json for all normal roadmap updates.
const fallbackModels = [
  {
    id: "psi0.4",
    name: "psi0.4",
    step: 500_000,
    stage: "pre",
    y: 226,
    labelPosition: "above",
    status: "done",
    modalities: "RGBC",
    parent: null,
    summary:
      "The RGBC foundation checkpoint that begins the PSI training lineage.",
    recipe: ["500k steps of RGBC pre-training."],
    wandb:
      "https://wandb.ai/long-range-prediction/psi2/runs/9c3p75h3?nw=nwuserklemenk",
    checkpoint:
      "PSI2_8B_RGBC_bvd2_TPUv5e_restart/model_00490000",
  },
  {
    id: "psi0.5",
    name: "psi0.5",
    step: 700_000,
    stage: "pre",
    y: 226,
    labelPosition: "above",
    status: "done",
    modalities: "RGBCFD",
    parent: "psi0.4",
    summary:
      "The first RGBCFD PSI checkpoint, adding flow and depth to the original visual recipe.",
    recipe: [
      "500k steps of RGBC pre-training.",
      "200k steps of RGBCFD pre-training.",
    ],
    wandb:
      "https://wandb.ai/long-range-prediction/psi2/runs/3pe76iz3?nw=nwuserklemenk",
    checkpoint:
      "PSI2_8B_RGBCFD_bvd2_TPUv5e_fromrgb/model_00700000",
  },
  {
    id: "psi0.5-base",
    name: "psi0.5-base",
    step: 750_000,
    stage: "mid",
    y: 386,
    status: "done",
    modalities: "RGBCFD",
    parent: "psi0.5",
    summary:
      "The released psi0.5 checkpoint with an additional 32k-context extension phase.",
    recipe: [
      "500k steps of RGBC pre-training.",
      "200k steps of RGBCFD pre-training.",
      "50k steps of RGBCFD context extension at 32k context, batch size 64, with a dropped learning rate.",
    ],
    link: "https://huggingface.co/StanfordNeuroAILab/psi0_5",
    wandb:
      "https://wandb.ai/long-range-prediction/psi2/runs/mozt3n8h/logs",
    checkpoint:
      "PSI2_8B_RGBCFD_bvd2_ctx32768_drop_hybrid_marlowe/model_00750000",
  },
  {
    id: "psi0.5-ctx128k",
    name: "psi0.5-ctx128k",
    step: 755_000,
    stage: "mid",
    y: 470,
    status: "done",
    modalities: "RGBCFD",
    parent: "psi0.5-base",
    summary:
      "A long-context extension of psi0.5-base for sequences containing up to 100 video frames.",
    recipe: [
      "Train for another 5k steps on RGBCFD sequences with up to 100 video frames, using 128k context length and batch size 64.",
    ],
  },
  {
    id: "psi0.5-r",
    name: "psi0.5-r",
    step: 800_000,
    stage: "mid",
    y: 552,
    status: "done",
    modalities: "RGBCFD",
    parent: "psi0.5",
    summary:
      "The robotics-specialized psi0.5 checkpoint, combining robot pre-training with context extension.",
    recipe: [
      "500k steps of RGBC pre-training.",
      "200k steps of RGBCFD pre-training.",
      "80k steps of robotics-data pre-training.",
      "20k steps of robot-data context extension at 32k context and batch size 64.",
    ],
  },
  {
    id: "psi0.5-r-libero",
    name: "psi0.5-r-libero",
    step: 810_000,
    stage: "post",
    y: 680,
    labelPosition: "left",
    status: "training",
    modalities: "RGBCFD",
    parent: "psi0.5-r",
    summary:
      "A LIBERO-specialized post-trained robotics checkpoint built from psi0.5-r.",
    recipe: [
      "Run 10k steps of LIBERO post-training with RGBCFD, batch size 64, and sequence length 4,096.",
    ],
  },
  {
    id: "psi0.5-r-abc",
    name: "psi0.5-r-abc",
    step: 850_000,
    stage: "post",
    y: 760,
    status: "planned",
    modalities: "RGBCFD",
    parent: "psi0.5-r",
    summary:
      "The planned ABC-specialized branch of the psi0.5 robotics checkpoint.",
    recipe: [
      "Run 45k steps of ABC post-training with RGBCFD.",
      "Finish with 5k steps of ABC context extension at 32k context.",
    ],
  },
  {
    id: "psi0.6",
    name: "psi0.6",
    step: 1_250_000,
    stage: "pre",
    y: 226,
    labelPosition: "above",
    status: "done",
    modalities: "RGBCFDT",
    parent: "psi0.5",
    summary:
      "A multimodal continual-pre-training checkpoint that adds text to the RGBCFD recipe.",
    recipe: ["Continually pre-train for 500k steps with RGBCFDT data."],
  },
  {
    id: "psi0.6-vlm",
    name: "psi0.6-vlm",
    step: 1_300_000,
    stage: "mid",
    y: 386,
    status: "training",
    modalities: "RGBCFD",
    parent: "psi0.6",
    summary:
      "A VLM-focused psi0.6 branch trained with learning-rate dropping and context extension.",
    recipe: [
      "Train for 30k steps on VLM datasets with learning-rate dropping.",
      "Run the final 20k steps at 32k context length and batch size 64.",
    ],
  },
  {
    id: "psi0.6-r",
    name: "psi0.6-r",
    step: 1_450_000,
    stage: "mid",
    y: 552,
    status: "planned",
    modalities: "RGBCFD",
    parent: "psi0.6",
    summary:
      "The planned robot-text specialization of psi0.6.",
    recipe: ["Train for 200k steps on robot-text data with RGBCFD."],
  },
  {
    id: "psi0.6-r-abc",
    name: "psi0.6-r-abc",
    step: 1_500_000,
    stage: "post",
    y: 680,
    status: "planned",
    modalities: "RGBCFDT",
    parent: "psi0.6",
    summary:
      "A planned ABC post-training branch of psi0.6 using the expanded text-conditioned modality set.",
    recipe: [
      "Run 45k steps of ABC post-training with RGBCFDT.",
      "Finish with 5k steps of ABC context extension using RGBCFDT at 32k context.",
    ],
  },
  {
    id: "psi0.7",
    name: "psi0.7",
    step: 1_450_000,
    stage: "pre",
    y: 226,
    labelPosition: "above",
    status: "training",
    modalities: "RGBCFDTP",
    parent: "psi0.6",
    summary:
      "The point-track PSI checkpoint, extending psi0.6 with point supervision.",
    recipe: [
      "Pre-train for 200k steps on point tracks and RGBCFDT data, using the full RGBCFDTP modality set.",
    ],
  },
  {
    id: "psi0.7-dropped",
    name: "psi0.7-poking",
    step: 1_500_000,
    stage: "mid",
    y: 386,
    status: "done",
    modalities: "RGBCFDTP",
    parent: "psi0.7",
    summary:
      "A dropped, high-resolution continuation of psi0.7 on point tracks and multimodal data.",
    recipe: [
      "Continue to 1.5M steps at high visual resolution with dropping on point tracks and RGBCFDT data.",
    ],
  },
  {
    id: "psi0.7-r",
    name: "psi0.7-r",
    step: 1_650_000,
    stage: "mid",
    y: 470,
    status: "planned",
    modalities: "RGBCFDTP",
    parent: "psi0.7",
    labelPosition: "left",
    summary:
      "The planned robotics continuation of psi0.7, preserving point tracks throughout robot training.",
    recipe: [
      "Follow the 200k-step psi0.6-r robotics recipe on robot data with the full RGBCFDTP modality set.",
    ],
  },
];

const rowYByStage = {
  pre: [226],
  mid: [386, 470, 552],
  post: [680, 760],
};

const models = (window.PSI_MODELS ?? fallbackModels).map((model) => {
  const y = model.y ?? rowYByStage[model.stage]?.[model.row ?? 0];
  if (!Number.isFinite(y)) {
    throw new Error(
      `Model "${model.id}" has no valid row for stage "${model.stage}".`,
    );
  }
  return { ...model, y };
});

const modelById = new Map(models.map((model) => [model.id, model]));

function createSvgElement(tag, attributes = {}, text = "") {
  const element = document.createElementNS(NS, tag);
  Object.entries(attributes).forEach(([key, value]) => {
    element.setAttribute(key, value);
  });
  if (text) {
    element.textContent = text;
  }
  return element;
}

function stepToX(step) {
  const progress = (step - chart.minStep) / (chart.maxStep - chart.minStep);
  return chart.left + progress * (chart.right - chart.left);
}

function formatStep(step) {
  if (step >= 1_000_000) {
    return `${Number((step / 1_000_000).toFixed(2))}M`;
  }
  return `${Math.round(step / 1000)}K`;
}

function formatTokens(step) {
  const trillions = (step / 1_000_000) * 2;
  return `${Number(trillions.toFixed(2))}T`;
}

function titleCase(value) {
  if (value === "training") {
    return "In training";
  }
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

function drawLanes() {
  Object.entries(lanes).forEach(([key, lane]) => {
    svg.append(
      createSvgElement("rect", {
        x: 24,
        y: lane.top,
        width: 1712,
        height: lane.bottom - lane.top,
        rx: 2,
        class: `lane-fill ${key}`,
      }),
      createSvgElement("line", {
        x1: 24,
        y1: lane.top,
        x2: 1736,
        y2: lane.top,
        class: "stage-line",
      }),
      createSvgElement(
        "text",
        { x: 45, y: lane.top + 31, class: "stage-label" },
        lane.label,
      ),
      createSvgElement(
        "text",
        { x: 45, y: lane.top + 51, class: "stage-description" },
        lane.description,
      ),
    );
  });
}

function drawAxis() {
  const ticks = [
    500_000,
    750_000,
    1_000_000,
    1_250_000,
    1_500_000,
    1_650_000,
  ];

  svg.append(
    createSvgElement("line", {
      x1: chart.left,
      y1: chart.axisY,
      x2: chart.right,
      y2: chart.axisY,
      class: "axis-line",
    }),
    createSvgElement("line", {
      x1: stepToX(500_000),
      y1: chart.axisY,
      x2: stepToX(1_650_000),
      y2: chart.axisY,
      class: "axis-progress",
    }),
  );

  ticks.forEach((step) => {
    const x = stepToX(step);
    svg.append(
      createSvgElement("line", {
        x1: x,
        y1: chart.axisY - 7,
        x2: x,
        y2: chart.axisY,
        class: "axis-tick",
      }),
      createSvgElement(
        "text",
        {
          x,
          y: chart.axisY - 18,
          class: "axis-label",
          "text-anchor": "middle",
        },
        formatStep(step),
      ),
      createSvgElement("line", {
        x1: x,
        y1: chart.axisY,
        x2: x,
        y2: chart.axisY + 7,
        class: "token-axis-tick",
      }),
      createSvgElement(
        "text",
        {
          x,
          y: chart.axisY + 23,
          class: "token-axis-label",
          "text-anchor": "middle",
        },
        formatTokens(step),
      ),
    );
  });

  svg.append(
    createSvgElement(
      "text",
      {
        x: 45,
        y: chart.axisY - 15,
        class: "axis-caption",
      },
      "TRAINING STEPS",
    ),
    createSvgElement(
      "text",
      {
        x: 45,
        y: chart.axisY + 22,
        class: "axis-caption",
      },
      "TOKENS (APPROX.)",
    ),
  );
}

function drawConnector(parent, child) {
  const parentX = stepToX(parent.step);
  const childX = stepToX(child.step);
  const deltaX = childX - parentX;
  const deltaY = child.y - parent.y;
  let path =
    Math.abs(deltaY) < 2
      ? `M ${parentX} ${parent.y} L ${childX} ${child.y}`
      : [
          `M ${parentX} ${parent.y}`,
          `C ${parentX + deltaX * 0.3} ${parent.y + deltaY * 0.08},`,
          `${childX - deltaX * 0.26} ${child.y - deltaY * 0.1},`,
          `${childX} ${child.y}`,
        ].join(" ");

  if (child.id === "psi0.5-r") {
    path = [
      `M ${parentX} ${parent.y}`,
      `C ${parentX} ${parent.y + 92},`,
      `${parentX + 2} ${child.y - 82},`,
      `${parentX + 44} ${child.y - 42}`,
      `C ${parentX + 66} ${child.y - 20},`,
      `${childX - 24} ${child.y},`,
      `${childX} ${child.y}`,
    ].join(" ");
  }

  if (child.id === "psi0.5-r-abc") {
    path = [
      `M ${parentX} ${parent.y}`,
      `C ${parentX} ${parent.y + 68},`,
      `${childX - 8} ${child.y - 78},`,
      `${childX} ${child.y}`,
    ].join(" ");
  }

  if (child.id === "psi0.6-r") {
    path = [
      `M ${parentX} ${parent.y}`,
      `C ${parentX} ${parent.y + 74},`,
      `${parentX + 7} ${child.y - 80},`,
      `${parentX + 47} ${child.y - 40}`,
      `C ${parentX + 87} ${child.y - 8},`,
      `${childX - 54} ${child.y},`,
      `${childX} ${child.y}`,
    ].join(" ");
  }

  if (child.id === "psi0.6-r-abc") {
    path = [
      `M ${parentX} ${parent.y}`,
      `C ${parentX} ${parent.y + 114},`,
      `${parentX + 7} ${child.y - 160},`,
      `${parentX + 77} ${child.y - 90}`,
      `C ${parentX + 137} ${child.y - 30},`,
      `${childX - 59} ${child.y},`,
      `${childX} ${child.y}`,
    ].join(" ");
  }

  if (child.id === "psi0.7-r") {
    path = [
      `M ${parentX} ${parent.y}`,
      `C ${parentX} ${parent.y + 72},`,
      `${parentX + 6} ${child.y - 70},`,
      `${parentX + 52} ${child.y - 70}`,
      `C ${parentX + 110} ${child.y - 70},`,
      `${childX} ${child.y - 70},`,
      `${childX} ${child.y}`,
    ].join(" ");
  }

  svg.append(
    createSvgElement("path", {
      d: path,
      class: "connector",
      "data-edge-child": child.id,
    }),
  );
}

function getLabelWidth(name) {
  return Math.max(88, Math.min(158, 45 + name.length * 6.7));
}

function drawNode(model) {
  const x = stepToX(model.step);
  const width = getLabelWidth(model.name);
  const height = 42;
  const labelPosition = model.labelPosition ?? "right";
  let labelX = x + 16;
  let labelY = model.y - height / 2;

  if (labelPosition === "left") {
    labelX = x - width - 16;
  } else if (labelPosition === "above") {
    labelX = x - width / 2;
    labelY = model.y - height - 16;
  } else if (labelPosition === "below") {
    labelX = x - width / 2;
    labelY = model.y + 16;
  }

  const node = createSvgElement("g", {
    class: "node-target",
    tabindex: "0",
    role: "button",
    "aria-expanded": "false",
    "aria-controls": "model-detail",
    "aria-label": `${model.name}, ${formatStep(model.step)} steps, ${titleCase(model.status)}. Open model details.`,
    "data-model-id": model.id,
  });

  node.append(
    createSvgElement("circle", {
      cx: x,
      cy: model.y,
      r: 19,
      class: "node-halo",
    }),
  );

  if (model.status === "training") {
    node.append(
      createSvgElement("circle", {
        cx: x,
        cy: model.y,
        r: 12,
        class: "node-status-ring",
      }),
    );
  }

  node.append(
    createSvgElement("circle", {
      cx: x,
      cy: model.y,
      r: 7,
      class: `node-dot ${model.status}`,
    }),
    createSvgElement("rect", {
      x: labelX,
      y: labelY,
      width,
      height,
      rx: 2,
      class: "node-label-bg",
    }),
    createSvgElement(
      "text",
      {
        x: labelX + 12,
        y: labelY + 17,
        class: "node-name",
      },
      model.name,
    ),
    createSvgElement(
      "text",
      {
        x: labelX + 12,
        y: labelY + 32,
        class: "node-step",
      },
      formatStep(model.step),
    ),
  );

  node.addEventListener("click", () => openModel(model.id));
  node.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openModel(model.id);
    }
  });

  svg.append(node);
}

function setText(id, value) {
  document.querySelector(`#${id}`).textContent = value;
}

function setExternalLink(element, url) {
  if (url) {
    element.href = url;
    element.hidden = false;
  } else {
    element.hidden = true;
    element.removeAttribute("href");
  }
}

function linkEntries(value) {
  if (!value) {
    return [];
  }
  return (Array.isArray(value) ? value : [value])
    .map((item) => (typeof item === "string" ? { url: item } : item))
    .filter((item) => item && item.url);
}

function setExternalLinkList(container, value, singleLabel) {
  const entries = linkEntries(value);
  container.classList.toggle("is-compact", entries.length > 3);
  container.replaceChildren(
    ...entries.map((entry) => {
      const link = document.createElement("a");
      link.className = "detail-link";
      link.href = entry.url;
      link.target = "_blank";
      link.rel = "noreferrer";
      const arrow = document.createElement("span");
      arrow.setAttribute("aria-hidden", "true");
      arrow.textContent = "↗";
      link.append(entry.label ?? singleLabel, arrow);
      return link;
    }),
  );
}

function openModel(id) {
  const model = modelById.get(id);
  if (!model) {
    return;
  }

  document.querySelectorAll(".node-target").forEach((node) => {
    const isActive = node.dataset.modelId === id;
    node.classList.toggle("is-active", isActive);
    node.setAttribute("aria-expanded", String(isActive));
  });
  document.querySelectorAll(".connector").forEach((edge) => {
    edge.classList.toggle("active", edge.dataset.edgeChild === id);
  });

  setText("detail-name", model.name);
  setText("detail-status", titleCase(model.status));
  setText("detail-summary", model.summary);
  setText("detail-step", formatStep(model.step));
  setText("detail-stage", `${model.stage.toUpperCase()} training`);
  setText("detail-modalities", model.modalities);
  setText(
    "detail-parent",
    model.parent ? modelById.get(model.parent).name : "Foundation",
  );

  const status = document.querySelector("#detail-status");
  status.className = `detail-status ${model.status}`;

  const recipe = document.querySelector("#detail-recipe");
  recipe.replaceChildren(
    ...model.recipe.map((item) => {
      const listItem = document.createElement("li");
      listItem.textContent = item;
      return listItem;
    }),
  );

  setExternalLinkList(
    document.querySelector("#detail-wandb-links"),
    model.wandb,
    "View W&B run",
  );
  setExternalLink(
    document.querySelector("#detail-hf-link"),
    model.huggingFace ?? model.link,
  );

  const checkpoint = document.querySelector("#detail-checkpoint");
  if (model.checkpoint) {
    checkpoint.hidden = false;
    setText("detail-checkpoint-name", model.checkpoint);
    setText(
      "detail-code",
      [
        "from ccwm.psi2.predictor import PSI2Predictor",
        "",
        "predictor = PSI2Predictor(",
        `    model_name=\"${model.checkpoint}\",`,
        "    device=\"cuda\",",
        ")",
      ].join("\n"),
    );
    checkpointCopy.dataset.copyText = model.checkpoint;
    checkpointCopy.textContent = "Copy name";
  } else {
    checkpoint.hidden = true;
    checkpointCopy.removeAttribute("data-copy-text");
  }

  detail.hidden = false;
  window.requestAnimationFrame(() => {
    detail.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
      block: "nearest",
    });
  });
}

function closeDetails() {
  detail.hidden = true;
  document.querySelectorAll(".node-target").forEach((node) => {
    node.classList.remove("is-active");
    node.setAttribute("aria-expanded", "false");
  });
  document
    .querySelectorAll(".connector")
    .forEach((edge) => edge.classList.remove("active"));
}

function validateModelData() {
  const errors = [];
  const statuses = new Set(["done", "training", "planned"]);
  const stages = new Set(Object.keys(lanes));

  models.forEach((model) => {
    if (!model.id || !model.name) {
      errors.push("Every model needs a non-empty id and name.");
    }
    if (!Number.isFinite(model.step)) {
      errors.push(`${model.id}: step must be a number.`);
    }
    if (!statuses.has(model.status)) {
      errors.push(`${model.id}: invalid status "${model.status}".`);
    }
    if (!stages.has(model.stage)) {
      errors.push(`${model.id}: invalid stage "${model.stage}".`);
    }
    if (model.parent && !modelById.has(model.parent)) {
      errors.push(`${model.id}: parent "${model.parent}" does not exist.`);
    }
    if (
      model.parent &&
      modelById.has(model.parent) &&
      model.step < modelById.get(model.parent).step
    ) {
      errors.push(`${model.id}: step is earlier than its parent.`);
    }
  });

  if (modelById.size !== models.length) {
    errors.push("Every model id must be unique.");
  }
  if (errors.length) {
    throw new Error(`Invalid models.json:\n${errors.join("\n")}`);
  }
}

function rectanglesOverlap(first, second) {
  return (
    first.x < second.x + second.width &&
    first.x + first.width > second.x &&
    first.y < second.y + second.height &&
    first.y + first.height > second.y
  );
}

function checkRoadmapLayout() {
  const cards = [...document.querySelectorAll(".node-label-bg")].map((card) => ({
    id: card.parentElement.dataset.modelId,
    box: card.getBBox(),
  }));
  const stageCopy = [
    ...document.querySelectorAll(".stage-label, .stage-description"),
  ].map((label) => ({ text: label.textContent, box: label.getBBox() }));
  const cardOverlaps = [];
  const stageOverlaps = [];
  const connectorIntersections = [];
  const leftBendingConnectors = [];

  cards.forEach((card, index) => {
    cards.slice(index + 1).forEach((other) => {
      if (rectanglesOverlap(card.box, other.box)) {
        cardOverlaps.push([card.id, other.id]);
      }
    });
    stageCopy.forEach((stage) => {
      if (rectanglesOverlap(card.box, stage.box)) {
        stageOverlaps.push([card.id, stage.text]);
      }
    });
  });

  document.querySelectorAll(".connector").forEach((path) => {
    const length = path.getTotalLength();
    let previousX = path.getPointAtLength(0).x;
    let bendsLeft = false;

    for (let distance = 4; distance < length - 9; distance += 2) {
      const point = path.getPointAtLength(distance);
      bendsLeft ||= point.x < previousX - 0.08;
      previousX = point.x;
      const hit = cards.find(
        ({ box }) =>
          point.x > box.x &&
          point.x < box.x + box.width &&
          point.y > box.y &&
          point.y < box.y + box.height,
      );
      if (
        hit &&
        !connectorIntersections.some(
          ([child]) => child === path.dataset.edgeChild,
        )
      ) {
        connectorIntersections.push([path.dataset.edgeChild, hit.id]);
      }
    }
    if (bendsLeft) {
      leftBendingConnectors.push(path.dataset.edgeChild);
    }
  });

  return {
    ok:
      cardOverlaps.length === 0 &&
      stageOverlaps.length === 0 &&
      connectorIntersections.length === 0 &&
      leftBendingConnectors.length === 0,
    modelCount: models.length,
    cardOverlaps,
    stageOverlaps,
    connectorIntersections,
    leftBendingConnectors,
  };
}

detailClose.addEventListener("click", closeDetails);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !detail.hidden) {
    closeDetails();
  }
});

async function copyText(value) {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(value);
      return;
    } catch {
      // Fall through for browsers that expose Clipboard API but deny access.
    }
  }

  const textArea = document.createElement("textarea");
  textArea.value = value;
  textArea.style.position = "fixed";
  textArea.style.opacity = "0";
  document.body.append(textArea);
  textArea.select();
  document.execCommand("copy");
  textArea.remove();
}

checkpointCopy.addEventListener("click", async () => {
  const value = checkpointCopy.dataset.copyText;
  if (!value) {
    return;
  }
  await copyText(value);
  checkpointCopy.textContent = "Copied";
  window.setTimeout(() => {
    checkpointCopy.textContent = "Copy name";
  }, 1400);
});

function updateThemeControl() {
  const currentTheme = document.documentElement.dataset.theme;
  const nextTheme = currentTheme === "dark" ? "light" : "dark";
  themeLabel.textContent = `${titleCase(nextTheme)} mode`;
  themeToggle.setAttribute(
    "aria-label",
    `Switch to ${nextTheme} color theme`,
  );
}

themeToggle.addEventListener("click", () => {
  const currentTheme = document.documentElement.dataset.theme;
  const nextTheme = currentTheme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = nextTheme;
  localStorage.setItem("psi-training-theme", nextTheme);
  updateThemeControl();
});

window
  .matchMedia("(prefers-color-scheme: light)")
  .addEventListener("change", (event) => {
    if (!localStorage.getItem("psi-training-theme")) {
      document.documentElement.dataset.theme = event.matches ? "light" : "dark";
      updateThemeControl();
    }
  });

validateModelData();
updateThemeControl();
drawLanes();
drawAxis();
models.forEach((model) => {
  if (model.parent) {
    drawConnector(modelById.get(model.parent), model);
  }
});
models.forEach(drawNode);
window.checkRoadmapLayout = checkRoadmapLayout;
