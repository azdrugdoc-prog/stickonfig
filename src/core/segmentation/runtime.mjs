import * as ort from "onnxruntime-web";
import { newSession, removeToCanvas, rembgConfig, setModelHash } from "@bunnio/rembg-web";
import {
  EndType,
  FillRule,
  JoinType,
  inflatePathsD,
  ramerDouglasPeuckerPathsD,
  simplifyPathsD,
  unionD
} from "clipper2-ts";

const WASM_BASE = new URL("./onnx/", import.meta.url).href;
ort.env.wasm.wasmPaths = WASM_BASE;
ort.env.wasm.numThreads = 1;
ort.env.wasm.proxy = false;
rembgConfig.setCustomModelPath("u2netp", new URL("../models/u2netp.onnx", import.meta.url).href);
setModelHash("u2netp.onnx", "309c8469258dda742793dce0ebea8e6dd393174f89934733ecc8b14c76f4ddd8");

let u2netpSessionPromise;

export function getU2NetpSession(onProgress) {
  if (!u2netpSessionPromise) {
    u2netpSessionPromise = newSession("u2netp", undefined, {
      executionProviders: ["wasm"],
      numThreads: 1,
      onProgress
    }).catch((error) => {
      u2netpSessionPromise = undefined;
      throw error;
    });
  }
  return u2netpSessionPromise;
}

export async function segmentForegroundToCanvas(source, onProgress) {
  const session = await getU2NetpSession(onProgress);
  return removeToCanvas(source, {
    session,
    postProcessMask: true,
    onProgress
  });
}

export const clipper = {
  EndType,
  FillRule,
  JoinType,
  inflatePathsD,
  ramerDouglasPeuckerPathsD,
  simplifyPathsD,
  unionD
};
