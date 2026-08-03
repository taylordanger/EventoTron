type StoredTransfer = {
  id: string;
  foodotronMealId: string;
  tabletronEventId: string | null;
  status: "pending" | "imported" | "cancelled";
  meal: Record<string, unknown>;
  createdAt: string;
  claimedAt: string | null;
};

type SuiteTransferStore = {
  transfers: Map<string, StoredTransfer>;
};

const globalKey = "__eventotron_transfer_store__";

function store(): SuiteTransferStore {
  const root = globalThis as typeof globalThis & {
    [globalKey]?: SuiteTransferStore;
  };
  root[globalKey] ??= { transfers: new Map() };
  return root[globalKey];
}

export function putLocalTransfer(transfer: StoredTransfer) {
  store().transfers.set(transfer.id, transfer);
}

export function getLocalTransfer(id: string) {
  return store().transfers.get(id) ?? null;
}

export function completeLocalTransfer(id: string, tabletronEventId: string) {
  const transfer = getLocalTransfer(id);
  if (!transfer) return null;
  const updated: StoredTransfer = {
    ...transfer,
    tabletronEventId,
    status: "imported",
    claimedAt: new Date().toISOString(),
    meal: {
      ...transfer.meal,
      tabletronEventId,
    },
  };
  putLocalTransfer(updated);
  return updated;
}
