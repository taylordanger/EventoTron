import { tmpdir } from "node:os";
import { join } from "node:path";

export const qaArtifact = name => join(process.env.EVENTOTRON_QA_ARTIFACT_DIR || tmpdir(), name);
