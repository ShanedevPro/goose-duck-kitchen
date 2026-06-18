export const ITEM_KINDS = Object.freeze({
  goose: "goose",
  duck: "duck",
});

export const LABELS = Object.freeze({
  goose: "goose",
  duck: "duck",
});

export const COOK_STATES = Object.freeze({
  raw: "raw",
  cooking: "cooking",
  cooked: "cooked",
  burnt: "burnt",
});

export const STATION_TYPES = Object.freeze({
  fridge: "fridge",
  grill: "grill",
  label: "label",
  serve: "serve",
  sauce: "sauce",
  trash: "trash",
});

export const KITCHEN = Object.freeze({
  width: 540,
  height: 960,
});
const ROUND_LENGTH_MS = 90_000;
const ORDER_DEADLINE_MS = 20_000;
const ORDER_INTERVAL_MS = 7_000;
const MAX_ACTIVE_ORDERS = 4;
const INTERACTION_RANGE = 86;
const TARGET_EPSILON = 6;
const COOKED_AT_MS = 4_000;
const BURNT_AT_MS = 8_000;

export const STATIONS = Object.freeze({
  gooseFridge: Object.freeze({
    id: "gooseFridge",
    x: 38,
    y: 234,
    w: 140,
    h: 104,
    type: STATION_TYPES.fridge,
    label: "鹅柜",
    itemKind: ITEM_KINDS.goose,
  }),
  duckFridge: Object.freeze({
    id: "duckFridge",
    x: 38,
    y: 378,
    w: 140,
    h: 104,
    type: STATION_TYPES.fridge,
    label: "鸭柜",
    itemKind: ITEM_KINDS.duck,
  }),
  grillA: Object.freeze({
    id: "grillA",
    x: 72,
    y: 600,
    w: 166,
    h: 116,
    type: STATION_TYPES.grill,
    label: "烤台 A",
  }),
  grillB: Object.freeze({
    id: "grillB",
    x: 302,
    y: 600,
    w: 166,
    h: 116,
    type: STATION_TYPES.grill,
    label: "烤台 B",
  }),
  gooseLabel: Object.freeze({
    id: "gooseLabel",
    x: 362,
    y: 234,
    w: 140,
    h: 104,
    type: STATION_TYPES.label,
    label: "鹅标",
    labelKind: LABELS.goose,
  }),
  duckLabel: Object.freeze({
    id: "duckLabel",
    x: 362,
    y: 378,
    w: 140,
    h: 104,
    type: STATION_TYPES.label,
    label: "鸭标",
    labelKind: LABELS.duck,
  }),
  serveWindow: Object.freeze({
    id: "serveWindow",
    x: 202,
    y: 126,
    w: 136,
    h: 104,
    type: STATION_TYPES.serve,
    label: "出餐",
  }),
  sauceStation: Object.freeze({
    id: "sauceStation",
    x: 46,
    y: 734,
    w: 104,
    h: 82,
    type: STATION_TYPES.sauce,
    label: "绿汁",
  }),
  trash: Object.freeze({
    id: "trash",
    x: 390,
    y: 734,
    w: 104,
    h: 82,
    type: STATION_TYPES.trash,
    label: "回收",
  }),
});

const ORDER_PATTERNS = [
  {
    truth: ITEM_KINDS.duck,
    needsSauce: false,
    supply: "进货单：鸭腿",
    shout: "顾客喊话：来个网红鹅腿",
  },
  {
    truth: ITEM_KINDS.goose,
    needsSauce: true,
    supply: "进货单：鹅腿",
    shout: "顾客喊话：今天有鹅腿吗",
  },
  {
    truth: ITEM_KINDS.duck,
    needsSauce: true,
    supply: "检测单：鸭腿",
    shout: "顾客喊话：招牌是不是鹅",
  },
  {
    truth: ITEM_KINDS.goose,
    needsSauce: false,
    supply: "冷柜标签：鹅腿",
    shout: "顾客喊话：照实写就行",
  },
  {
    truth: ITEM_KINDS.duck,
    needsSauce: false,
    supply: "供货备注：水禽鸭腿",
    shout: "顾客喊话：别让我猜",
  },
  {
    truth: ITEM_KINDS.goose,
    needsSauce: true,
    supply: "进货单：大鹅腿",
    shout: "顾客喊话：我要看清标签",
  },
];

const INITIAL_PLAYER = Object.freeze({
  x: 270,
  y: 840,
  speed: 320,
  radius: 24,
  holding: null,
  target: null,
});

export function createInitialState() {
  return {
    status: "ready",
    score: 0,
    trust: 80,
    combo: 0,
    bestCombo: 0,
    timeLeftMs: ROUND_LENGTH_MS,
    elapsedMs: 0,
    nextOrderId: 2,
    nextOrderAt: ORDER_INTERVAL_MS,
    player: { ...INITIAL_PLAYER },
    stations: STATIONS,
    grills: {
      grillA: { item: null },
      grillB: { item: null },
    },
    orders: [],
    inspection: {
      active: false,
      deadlineAt: null,
      resolved: false,
      triggeredAt: null,
    },
    triggeredInspections: [],
    feedback: {
      tone: "neutral",
      text: "点台面，自动走过去。",
    },
  };
}

export function startGame(now = 0) {
  void now;

  return {
    ...createInitialState(),
    status: "playing",
    orders: [createOrder(1, 0)],
    nextOrderId: 2,
    nextOrderAt: ORDER_INTERVAL_MS,
  };
}

export function stepGame(state, input = {}, deltaMs = 0, now = 0) {
  void now;

  if (state.status !== "playing") {
    return state;
  }

  const elapsedMs = state.elapsedMs + Math.max(0, deltaMs);
  const timeLeftMs = Math.max(0, state.timeLeftMs - Math.max(0, deltaMs));
  let player = movePlayer(state.player, input, Math.max(0, deltaMs));
  let trust = state.trust;
  let combo = state.combo;
  let feedback = state.feedback;
  let expirationResult = expireOrders(
    state.orders,
    elapsedMs,
    trust,
    combo,
    feedback,
  );
  let orders = expirationResult.orders;
  trust = expirationResult.trust;
  combo = expirationResult.combo;
  feedback = expirationResult.feedback;

  let nextOrderId = state.nextOrderId;
  let nextOrderAt = state.nextOrderAt;
  if (timeLeftMs > 0) {
    while (elapsedMs >= nextOrderAt) {
      const order = createOrder(nextOrderId, nextOrderAt);
      nextOrderId += 1;
      nextOrderAt += ORDER_INTERVAL_MS;

      if (order.deadlineAt <= elapsedMs) {
        trust = clamp(trust - 8, 0, 100);
        combo = 0;
        feedback = {
          tone: "bad",
          text: "顾客等太久走了，信誉下降。",
        };
      } else if (orders.length < MAX_ACTIVE_ORDERS) {
        orders = [...orders, order];
      }
    }
  }

  let nextState = finalizeState({
    ...state,
    status: "playing",
    player,
    grills: updateGrills(state.grills, elapsedMs),
    orders,
    trust,
    combo,
    timeLeftMs,
    elapsedMs,
    nextOrderId,
    nextOrderAt,
    inspection: {
      active: false,
      deadlineAt: null,
      resolved: false,
      triggeredAt: null,
    },
    triggeredInspections: [],
    feedback,
  });

  if (nextState.status !== "playing") {
    if (nextState.player.arrivedStationId) {
      return {
        ...nextState,
        player: removeArrivedStation(nextState.player),
      };
    }

    return nextState;
  }

  if (nextState.player.arrivedStationId) {
    const station = nextState.stations[nextState.player.arrivedStationId];
    player = removeArrivedStation(nextState.player);
    nextState = {
      ...nextState,
      player,
    };

    if (station) {
      nextState = interactWithStation(nextState, station, elapsedMs);
    }
  }

  return nextState;
}

export function interact(state, now = 0) {
  void now;

  if (state.status !== "playing") {
    return state;
  }

  const station = getNearbyStation(state);
  if (!station) {
    return {
      ...state,
      feedback: {
        tone: "neutral",
        text: "靠近一个台面再操作。",
      },
    };
  }

  return interactWithStation(state, station, state.elapsedMs);
}

export function getStationAtPoint(state, x, y) {
  return (
    Object.values(state.stations).find((station) => {
      return (
        x >= station.x &&
        x <= station.x + station.w &&
        y >= station.y &&
        y <= station.y + station.h
      );
    }) ?? null
  );
}

export function setMoveTarget(state, x, y) {
  if (state.status !== "playing") {
    return state;
  }

  const station = getStationAtPoint(state, x, y);
  const targetX = station ? station.x + station.w / 2 : clamp(x, 0, KITCHEN.width);
  const targetY = station ? station.y + station.h / 2 : clamp(y, 0, KITCHEN.height);

  return {
    ...state,
    player: {
      ...state.player,
      target: {
        x: targetX,
        y: targetY,
        stationId: station?.id ?? null,
      },
    },
    feedback: station
      ? {
          tone: "neutral",
          text: `去${station.label}`,
        }
      : state.feedback,
  };
}

export function getNearbyStation(state) {
  let nearest = null;
  let nearestDistance = Infinity;

  for (const station of Object.values(state.stations)) {
    const distance = distanceToRect(state.player.x, state.player.y, station);
    if (distance <= INTERACTION_RANGE && distance < nearestDistance) {
      nearest = station;
      nearestDistance = distance;
    }
  }

  return nearest;
}

export function labelText(label) {
  if (label === LABELS.goose) {
    return "鹅腿";
  }

  if (label === LABELS.duck) {
    return "鸭腿";
  }

  throw new RangeError("Unknown label");
}

export function itemText(kind) {
  if (kind === ITEM_KINDS.goose) {
    return "鹅腿";
  }

  if (kind === ITEM_KINDS.duck) {
    return "鸭腿";
  }

  throw new RangeError("Unknown item kind");
}

export function getGameSummary(state) {
  if (state.trust >= 85 && state.score >= 900) {
    return {
      title: "透明摊主",
      detail: "如实标注撑住了信誉，小摊稳稳出餐。",
    };
  }

  if (state.trust >= 55) {
    return {
      title: "厨房补丁员",
      detail: "出餐能跟上，标签还可以再稳一点。",
    };
  }

  return {
    title: "热搜边缘",
    detail: "先把原料和标签写明白，再开下一炉。",
  };
}

export function getActionHint(state) {
  const holding = state.player.holding;

  if (!holding) {
    const cookingItem = Object.values(state.grills).find((grill) => {
      return grill.item?.cookState === COOK_STATES.cooking;
    })?.item;

    if (cookingItem) {
      return {
        current: `烤${itemText(cookingItem.kind)}`,
        next: "等火候",
      };
    }

    return {
      current: "空手",
      next: "点鹅柜或鸭柜",
    };
  }

  if (holding.cookState === COOK_STATES.raw) {
    return {
      current: `生${itemText(holding.kind)}`,
      next: "点烤台",
    };
  }

  if (holding.cookState === COOK_STATES.cooking) {
    return {
      current: `烤${itemText(holding.kind)}`,
      next: "等火候",
    };
  }

  if (!holding.label) {
    return {
      current: itemText(holding.kind),
      next: "点鹅标或鸭标",
    };
  }

  const matchingOrder = state.orders.find((order) => order.truth === holding.kind);
  if (matchingOrder?.needsSauce && !holding.sauced) {
    return {
      current: `${labelText(holding.label)}已贴`,
      next: "点绿汁",
    };
  }

  if (matchingOrder && !matchingOrder.needsSauce && holding.sauced) {
    return {
      current: "已蘸绿汁",
      next: "这单不蘸汁",
    };
  }

  return {
    current: holding.sauced ? "绿汁已蘸" : `${labelText(holding.label)}已贴`,
    next: "点出餐",
  };
}

function createOrder(id, now) {
  const pattern = ORDER_PATTERNS[(id - 1) % ORDER_PATTERNS.length];
  return {
    id,
    truth: pattern.truth,
    needsSauce: pattern.needsSauce,
    supply: pattern.supply,
    shout: pattern.shout,
    createdAt: now,
    deadlineAt: now + ORDER_DEADLINE_MS,
  };
}

function expireOrders(orders, elapsedMs, trust, combo, feedback) {
  let nextTrust = trust;
  let nextCombo = combo;
  let nextFeedback = feedback;
  const activeOrders = orders.filter((order) => {
    if (elapsedMs < order.deadlineAt) {
      return true;
    }

    nextTrust = clamp(nextTrust - 8, 0, 100);
    nextCombo = 0;
    nextFeedback = {
      tone: "bad",
      text: "顾客等太久走了，信誉下降。",
    };
    return false;
  });

  return {
    orders: activeOrders,
    trust: nextTrust,
    combo: nextCombo,
    feedback: nextFeedback,
  };
}

function movePlayer(player, input, deltaMs) {
  if (player.target) {
    const distance = player.speed * (deltaMs / 1000);
    const dx = player.target.x - player.x;
    const dy = player.target.y - player.y;
    const length = Math.hypot(dx, dy);

    if (length <= Math.max(distance, TARGET_EPSILON)) {
      return {
        ...player,
        x: player.target.x,
        y: player.target.y,
        target: null,
        arrivedStationId: player.target.stationId,
      };
    }

    return {
      ...player,
      x: clamp(player.x + (dx / length) * distance, 0, KITCHEN.width),
      y: clamp(player.y + (dy / length) * distance, 0, KITCHEN.height),
    };
  }

  const dx = Number(Boolean(input.right)) - Number(Boolean(input.left));
  const dy = Number(Boolean(input.down)) - Number(Boolean(input.up));

  if (dx === 0 && dy === 0) {
    return { ...player };
  }

  const length = Math.hypot(dx, dy);
  const distance = player.speed * (deltaMs / 1000);

  return {
    ...player,
    x: clamp(player.x + (dx / length) * distance, 0, KITCHEN.width),
    y: clamp(player.y + (dy / length) * distance, 0, KITCHEN.height),
    target: null,
  };
}

function removeArrivedStation(player) {
  const { arrivedStationId, ...nextPlayer } = player;
  return nextPlayer;
}

function interactWithStation(state, station, now) {
  if (station.type === STATION_TYPES.fridge) {
    return takeFromFridge(state, station);
  }

  if (station.type === STATION_TYPES.grill) {
    return useGrill(state, station, now);
  }

  if (station.type === STATION_TYPES.label) {
    return useLabelStation(state, station);
  }

  if (station.type === STATION_TYPES.serve) {
    return serveHeldItem(state, now);
  }

  if (station.type === STATION_TYPES.sauce) {
    return useSauceStation(state);
  }

  if (station.type === STATION_TYPES.trash) {
    return useTrash(state);
  }

  return state;
}

function takeFromFridge(state, station) {
  if (state.player.holding) {
    return {
      ...state,
      feedback: {
        tone: "neutral",
        text: "手上已经拿着东西了。",
      },
    };
  }

  return {
    ...state,
    player: {
      ...state.player,
      holding: {
        kind: station.itemKind,
        cookState: COOK_STATES.raw,
        label: null,
        sauced: false,
      },
    },
    feedback: {
      tone: "good",
      text: `取出一只生${itemText(station.itemKind)}。`,
    },
  };
}

function useGrill(state, station, now) {
  const grill = state.grills[station.id];
  const grillItem = grill.item ? updateCookState(grill.item, now) : null;
  const holding = state.player.holding;

  if (!holding && grillItem) {
    return {
      ...state,
      player: {
        ...state.player,
        holding: stripGrillTiming(grillItem),
      },
      grills: {
        ...state.grills,
        [station.id]: { item: null },
      },
      feedback: {
        tone: grillItem.cookState === COOK_STATES.burnt ? "bad" : "good",
        text:
          grillItem.cookState === COOK_STATES.burnt
            ? `${itemText(grillItem.kind)}烤焦了，最好丢掉。`
            : `拿起烤好的${itemText(grillItem.kind)}。`,
      },
    };
  }

  if (!holding) {
    return {
      ...state,
      feedback: {
        tone: "neutral",
        text: "烤炉上还没有食材。",
      },
    };
  }

  if (grillItem) {
    return {
      ...state,
      grills: {
        ...state.grills,
        [station.id]: { item: grillItem },
      },
      feedback: {
        tone: "neutral",
        text: "烤炉正忙，先拿走上面的腿。",
      },
    };
  }

  if (holding.cookState !== COOK_STATES.raw) {
    return {
      ...state,
      feedback: {
        tone: "neutral",
        text: "这里只能放生腿上炉。",
      },
    };
  }

  return {
    ...state,
    player: {
      ...state.player,
      holding: null,
    },
    grills: {
      ...state.grills,
      [station.id]: {
        item: {
          ...holding,
          cookState: COOK_STATES.cooking,
          startedAt: now,
          cookElapsed: 0,
        },
      },
    },
    feedback: {
      tone: "good",
      text: `${itemText(holding.kind)}上炉了，盯住火候。`,
    },
  };
}

function useLabelStation(state, station) {
  const holding = state.player.holding;

  if (!holding) {
    return {
      ...state,
      feedback: {
        tone: "neutral",
        text: "先拿熟腿。",
      },
    };
  }

  if (holding.cookState === COOK_STATES.raw || holding.cookState === COOK_STATES.cooking) {
    return {
      ...state,
      feedback: {
        tone: "neutral",
        text: "先烤熟。",
      },
    };
  }

  return {
    ...state,
    player: {
      ...state.player,
      holding: {
        ...holding,
        label: station.labelKind,
      },
    },
    feedback: {
      tone: station.labelKind === holding.kind ? "good" : "bad",
      text: `贴${labelText(station.labelKind)}。`,
    },
  };
}

function useSauceStation(state) {
  const holding = state.player.holding;

  if (!holding) {
    return {
      ...state,
      feedback: {
        tone: "neutral",
        text: "先拿熟腿。",
      },
    };
  }

  if (holding.cookState !== COOK_STATES.cooked) {
    return {
      ...state,
      feedback: {
        tone: "neutral",
        text: "先烤熟。",
      },
    };
  }

  if (holding.sauced) {
    return {
      ...state,
      feedback: {
        tone: "neutral",
        text: "已经蘸过绿汁。",
      },
    };
  }

  return {
    ...state,
    player: {
      ...state.player,
      holding: {
        ...holding,
        sauced: true,
      },
    },
    feedback: {
      tone: "good",
      text: "蘸上秘制绿汁。",
    },
  };
}

function serveHeldItem(state, now) {
  const holding = state.player.holding;
  const matchingOrder = holding
    ? state.orders.find((order) => order.truth === holding.kind)
    : null;
  const correct =
    holding &&
    matchingOrder &&
    holding.cookState === COOK_STATES.cooked &&
    holding.label === holding.kind &&
    Boolean(holding.sauced) === Boolean(matchingOrder.needsSauce);

  if (!correct) {
    return finalizeState({
      ...state,
      score: Math.max(0, state.score - 50),
      trust: clamp(state.trust - 12, 0, 100),
      combo: 0,
      feedback: {
        tone: "bad",
        text: failedServeText(holding, matchingOrder),
      },
    });
  }

  const orderRemainingMs = Math.max(0, matchingOrder.deadlineAt - now);
  const scoreGain = 120 + state.combo * 15 + Math.ceil(orderRemainingMs / 1000) * 3;
  const combo = state.combo + 1;

  return finalizeState({
    ...state,
    score: state.score + scoreGain,
    trust: clamp(state.trust + 2, 0, 100),
    combo,
    bestCombo: Math.max(state.bestCombo, combo),
    orders: state.orders.filter((order) => order.id !== matchingOrder.id),
    player: {
      ...state.player,
      holding: null,
    },
    feedback: {
      tone: "good",
      text: `出餐成功：${itemText(holding.kind)}标签清楚。`,
    },
  });
}

function failedServeText(holding, matchingOrder) {
  if (!holding) {
    return "没有餐品也不能出餐，顾客不收。";
  }

  if (holding.cookState === COOK_STATES.burnt) {
    return "烤焦的餐品顾客不收。";
  }

  if (holding.cookState !== COOK_STATES.cooked) {
    return "还没烤熟，顾客不收。";
  }

  if (holding.label !== holding.kind) {
    return "错标了，标签和真实食材不一致，顾客不收。";
  }

  if (!matchingOrder) {
    return "没有匹配订单，顾客不收。";
  }

  if (matchingOrder.needsSauce && !holding.sauced) {
    return "这单要绿汁，顾客不收。";
  }

  if (!matchingOrder.needsSauce && holding.sauced) {
    return "这单不蘸汁，顾客不收。";
  }

  return "出餐不对，顾客不收。";
}

function useTrash(state) {
  if (!state.player.holding) {
    return {
      ...state,
      feedback: {
        tone: "neutral",
        text: "手上没东西。",
      },
    };
  }

  return {
    ...state,
    player: {
      ...state.player,
      holding: null,
    },
    feedback: {
      tone: "neutral",
      text: "已丢弃手上的餐品。",
    },
  };
}

function updateGrills(grills, now) {
  return Object.fromEntries(
    Object.entries(grills).map(([id, grill]) => [
      id,
      {
        item: grill.item ? updateCookState(grill.item, now) : null,
      },
    ]),
  );
}

function updateCookState(item, now) {
  if (typeof item.startedAt !== "number") {
    return { ...item };
  }

  const cookElapsed = Math.max(0, now - item.startedAt);
  let cookState = COOK_STATES.cooking;
  if (cookElapsed >= BURNT_AT_MS) {
    cookState = COOK_STATES.burnt;
  } else if (cookElapsed >= COOKED_AT_MS) {
    cookState = COOK_STATES.cooked;
  }

  return {
    ...item,
    cookState,
    cookElapsed,
  };
}

function stripGrillTiming(item) {
  const { startedAt, cookElapsed, ...heldItem } = item;
  return heldItem;
}

function finalizeState(state) {
  if (state.timeLeftMs <= 0 || state.trust <= 0) {
    return {
      ...state,
      status: "ended",
      timeLeftMs: Math.max(0, state.timeLeftMs),
      trust: clamp(state.trust, 0, 100),
    };
  }

  return {
    ...state,
    trust: clamp(state.trust, 0, 100),
  };
}

function distanceToRect(x, y, rect) {
  const closestX = clamp(x, rect.x, rect.x + rect.w);
  const closestY = clamp(y, rect.y, rect.y + rect.h);
  return Math.hypot(x - closestX, y - closestY);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
