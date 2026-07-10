/**
 * Composition root — the only file that knows every concrete class.
 * Direction of knowledge: presentation/application → ports ← infrastructure.
 */

import { ChainSync } from "../application/chain-sync.js";
import { GetMetadata, PutMetadata } from "../application/metadata.js";
import { GetOrderBook, SubmitOrder } from "../application/orders.js";
import { Queries } from "../application/queries.js";
import type { Logger } from "../application/ports.js";
import { loadConfig, type AppConfig } from "../infrastructure/config.js";
import { createDb } from "../infrastructure/db/client.js";
import { DrizzleMetadataStore } from "../infrastructure/db/stores/metadata-store.js";
import { DrizzleOrderStore } from "../infrastructure/db/stores/order-store.js";
import { DrizzleProjectionStore, DrizzleUnitOfWork } from "../infrastructure/db/stores/projection-store.js";
import { DrizzleCampaignQueryStore } from "../infrastructure/db/stores/query-store.js";
import { ViemOrderSignatureVerifier, ViemPersonalSignVerifier } from "../infrastructure/chain/verifiers.js";
import { createViemClient, ViemChainSource } from "../infrastructure/chain/viem-chain-source.js";
import { createLogger } from "../infrastructure/logger.js";
import { DisabledFileStore, R2FileStore } from "../infrastructure/storage/r2-file-store.js";
import { buildServer } from "../presentation/http/server.js";

export function createContainer(name: string, config: AppConfig = loadConfig()) {
  const log: Logger = createLogger(config.logLevel, name);
  const { db, pool } = createDb(config.databaseUrl);

  const queryStore = new DrizzleCampaignQueryStore(db);
  const orderStore = new DrizzleOrderStore(db);
  const metadataStore = new DrizzleMetadataStore(db);
  const projectionStore = new DrizzleProjectionStore(db);
  const uow = new DrizzleUnitOfWork(db);

  const orderVerifier = new ViemOrderSignatureVerifier(config.chainId);
  const personalVerifier = new ViemPersonalSignVerifier();
  const fileStore = config.r2 ? new R2FileStore(config.r2) : new DisabledFileStore();

  const queries = new Queries(queryStore, metadataStore, config.chainId);
  const submitOrder = new SubmitOrder(queryStore, orderStore, orderVerifier);
  const getOrderBook = new GetOrderBook(queryStore, orderStore);
  const putMetadata = new PutMetadata(
    queryStore,
    metadataStore,
    personalVerifier,
    fileStore,
    config.chainId,
    config.maxCoverBytes
  );
  const getMetadata = new GetMetadata(metadataStore);

  const buildApi = () =>
    buildServer({
      queries,
      submitOrder,
      getOrderBook,
      putMetadata,
      getMetadata,
      indexerStatus: async () => ({ lastIndexedBlock: await projectionStore.getCursor(config.chainId) }),
      chainId: config.chainId,
      tokenDecimals: config.tokenDecimals,
      maxCoverBytes: config.maxCoverBytes,
      corsOrigin: config.corsOrigin,
      log,
    });

  const buildIndexer = () => {
    const client = createViemClient(config.rpcUrl);
    const chainSource = new ViemChainSource(client, config.factoryAddress, config.chainId);
    return new ChainSync(
      chainSource,
      uow,
      {
        chainId: config.chainId,
        factoryAddress: config.factoryAddress,
        confirmations: config.confirmations,
        blockRange: config.logBlockRange,
        ...(config.startBlock !== undefined ? { startBlock: config.startBlock } : {}),
      },
      log
    );
  };

  return { config, log, db, pool, buildApi, buildIndexer };
}
