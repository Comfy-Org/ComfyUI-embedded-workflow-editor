"use client";
import Editor, { useMonaco } from "@monaco-editor/react";
import clsx from "clsx";
import md5 from "md5";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import toast, { Toaster } from "react-hot-toast";
import { useSearchParam } from "react-use";
import sflow, { sf } from "sflow";
import useSWR from "swr";
import TimeAgo from "timeago-react";
// import useManifestPWA from "use-manifest-pwa";
import { useSnapshot } from "valtio";
import { persistState } from "./persistState";
import { readWorkflowInfo, setWorkflowInfo } from "./utils/exif";

/**
 * @author snomiao <snomiao@gmail.com> 2024
 */
export default function Home() {
  // todo: enable this in another PR
  // useManifestPWA({
  //   icons: [
  //     {
  //       src: "/favicon.png",
  //       sizes: "192x192",
  //       type: "image/png",
  //     },
  //     {
  //       src: "/favicon.png",
  //       sizes: "512x512",
  //       type: "image/png",
  //     },
  //   ],
  //   name: "ComfyUI Embedded Workflow Editor",
  //   short_name: "CWE",
  //   start_url: globalThis.window?.location.origin ?? "/",
  // });

  const snap = useSnapshot(persistState);
  const snapSync = useSnapshot(persistState, { sync: true });
  const [workingDir, setWorkingDir] = useState<FileSystemDirectoryHandle>();
  const [urlInput, setUrlInput] = useState("");

  useSWR(
    "/filelist",
    async () => workingDir && (await scanFilelist(workingDir)),
  );

  const monaco = useMonaco();
  const [editor, setEditor] = useState<any>();

  useEffect(() => {
    if (!monaco || !editor) return;
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, async () => {
      const savebtn = window.document.querySelector(
        "#save-workflow",
      ) as HTMLButtonElement;
      savebtn?.click();
    });
  }, [monaco, editor]);

  const [tasklist, setTasklist] = useState<
    Awaited<ReturnType<typeof readWorkflowInfo>>[]
  >([]);

  async function gotFiles(input: File[] | FileList) {
    const files = input instanceof FileList ? fileListToArray(input) : input;
    if (!files.length) return toast.error("No files provided.");
    const readedWorkflowInfos = (await sflow(files)
      .filter((e) => {
        if (e.name.match(/\.(png|flac|webp|mp4|mp3)$/i)) return true;
        toast.error("Not Supported format discarded: " + e.name);
        return null;
      })
      .map(
        async (e) =>
          await readWorkflowInfo(e).catch((err) => {
            toast.error(`FAIL to read ${e.name}\nCause:${String(err)}`);
            return null;
          }),
      )
      .filter(
        (e): e is Awaited<ReturnType<typeof readWorkflowInfo>> => e !== null,
      )
      .toArray()) as Awaited<ReturnType<typeof readWorkflowInfo>>[];
    setWorkingDir(undefined);
    setTasklist(readedWorkflowInfos);
    chooseNthFileToEdit(readedWorkflowInfos, 0);
  }
  async function loadMediaFromUrl(url: string) {
    try {
      setUrlInput(url);
      toast.loading(`Loading file from URL: ${url}`);

      // Use the proxy endpoint instead of fetching directly
      const proxyUrl = `/api/media?url=${encodeURIComponent(url)}`;
      const response = await fetch(proxyUrl);

      if (!response.ok) {
        // Try to parse error message from JSON response
        try {
          const errorData = await response.json();
          throw new Error(
            errorData.error ||
              `Failed to fetch file from URL: ${response.statusText}`,
          );
        } catch (e) {
          throw new Error(
            `Failed to fetch file from URL: ${response.statusText}`,
          );
        }
      }

      const contentType = response.headers.get("content-type") || "";
      // Assume backend already parses filename and throws if not present
      const fileName = (() => {
        const contentDisposition = response.headers.get("content-disposition");
        if (!contentDisposition)
          throw new Error("No filename provided by backend");
        const match = contentDisposition.match(
          /filename\*?=(?:UTF-8'')?["']?([^;"']+)/i,
        );
        if (match && match[1]) {
          return decodeURIComponent(match[1]);
        }
        throw new Error("Failed to parse filename from backend response");
      })();

      const blob = await response.blob();
      const file = new File([blob], fileName, {
        type: contentType || blob.type,
      });
      console.log("Loaded file from URL:", file);
      await gotFiles([file]);
      toast.dismiss();
      toast.success(`File loaded from URL: ${fileName}`);
    } catch (error) {
      toast.dismiss();
      toast.error(
        `Error loading file from URL: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      console.error("Error loading file from URL:", error);
    }
  }
  const urlParam = useSearchParam("url");
  useEffect(() => {
    if (urlParam) {
      if (Array.isArray(urlParam)) {
        toast.error("Only one URL is supported at a time.");
      } else {
        loadMediaFromUrl(urlParam);
      }
    }
  }, [urlParam]);

  return (
    <div
      className="flex flex-row gap-1 justify-center rounded-lg"
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = "copy";
      }}
      onDrop={async (e) => {
        e.preventDefault();
        e.stopPropagation();
        await gotFiles(e.dataTransfer.files);
      }}
    >
      <div className="flex flex-col gap-4 config bg-dark shadow-lg p-4 w-[40em] max-h-screen rounded-lg">
        <h2 className="text-lg font-bold">
          ComfyUI Workflow Editor <i className="text-xs">in your browser</i>
        </h2>
        <div className="flex flex-col gap-1">
          <div className="">
            <label className="font-semibold">
              Import files (supports *.png, *.webp, *.flac, *.mp4):
            </label>
            &nbsp;
            <span>{workingDir ? "✅ Linked" : ""}</span>
          </div>
          <div className="gap-2 flex flex-col items-center">
            <input
              readOnly
              className="input input-bordered border-dashed input-sm w-full text-center"
              placeholder="Way-1. Paste/Drop files here (png, webp, flac, mp3, mp4)"
              onPaste={async (e) => await gotFiles(e.clipboardData.files)}
            />
            <div className="flex w-full gap-2">
              <input
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                className="input input-bordered input-sm flex-1"
                placeholder="Way-4. Paste URL here (png, webp, flac, mp3, mp4)"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && urlInput) {
                    (
                      e.target as HTMLInputElement
                    ).nextElementSibling?.dispatchEvent(
                      new MouseEvent("click", { bubbles: true }),
                    );
                  }
                }}
              />
              <button
                className="btn btn-sm"
                disabled={
                  !urlInput ||
                  !/^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(urlInput.trim())
                }
                onClick={() => {
                  if (urlInput) {
                    const url = new URL(window.location.href);
                    url.searchParams.set("url", urlInput);
                    window.history.pushState({}, "", url);
                    loadMediaFromUrl(urlInput);
                  }
                }}
              >
                Load URL
              </button>
            </div>
            <motion.button
              name="open-files"
              className="btn w-full"
              animate={{}}
              onClick={async () => {
                const filesHandles: FileSystemFileHandle[] =
                  await window.showOpenFilePicker({
                    types: [
                      {
                        description: "Supported Files",
                        accept: {
                          "image/*": [".png", ".webp"],
                          "audio/*": [".flac", ".mp3"],
                          "video/*": [".mp4"],
                        },
                      },
                    ],
                    excludeAcceptAllOption: true,
                    multiple: true,
                  });
                const files = (await sf(filesHandles)
                  .map((e) => e.getFile())
                  .toArray()) as File[];
                return gotFiles(files);
              }}
            >
              Way-2. Upload Files
            </motion.button>
            <button
              name="mount-folder"
              className="btn w-full"
              onClick={async () => {
                const workingDir =
                  (await window.showDirectoryPicker()) as unknown as FileSystemDirectoryHandle;
                setWorkingDir(workingDir);
                chooseNthFileToEdit(await scanFilelist(workingDir), 0);
              }}
            >
              Way-3. Mount a Folder
            </button>
            <i>* possibly choose /ComfyUI/output</i>
          </div>
        </div>
        <br />
        <label className="font-semibold">Editable Workflows</label>
        <ul className={clsx("flex flex-col gap-1 overflow-auto")}>
          <fieldset>
            {!tasklist.length && (
              <div>
                Nothing editable yet, please import files with workflow embedded
              </div>
            )}
            {tasklist.map((e, i) => {
              const id = md5(e.name);
              const editingTask = tasklist[snap.editing_index];
              return (
                <li
                  key={id}
                  className={clsx("p-1", {
                    "bg-slate-200": editingTask?.name === e.name,
                  })}
                  onClick={() => chooseNthFileToEdit(tasklist, i)}
                >
                  <input
                    id={id}
                    type="radio"
                    name="editing_workflow_json"
                    onClick={() => void chooseNthFileToEdit(tasklist, i)}
                    value={e.name}
                  />{" "}
                  {(() => {
                    const thumbnail: Record<string, JSX.Element> = {
                      flac: (
                        <div className="w-[2em] h-[2em] inline-flex items-center justify-center bg-slate-100 rounded">
                          <span className="text-xs">🎵</span>
                        </div>
                      ),
                      mp4: (
                        <div className="w-[2em] h-[2em] inline-flex items-center justify-center bg-slate-100 rounded">
                          <span className="text-xs">🎬</span>
                        </div>
                      ),
                      video: (
                        <div className="w-[2em] h-[2em] inline-flex items-center justify-center bg-slate-100 rounded">
                          <span className="text-xs">🎬</span>
                        </div>
                      ),
                      img: (
                        <img
                          src={e.previewUrl}
                          className="w-[2em] h-[2em] inline object-cover"
                          alt="Preview"
                        />
                      ),
                      default: (
                        <div className="w-[2em] h-[2em] inline-flex items-center justify-center bg-slate-100 rounded">
                          <span className="text-xs">❓</span>
                        </div>
                      ),
                    };
                    const ext =
                      e.file.name.split(".").pop()?.toLowerCase() || "";
                    const typeMap: Record<string, keyof typeof thumbnail> = {
                      png: "img",
                      jpg: "img",
                      jpeg: "img",
                      webp: "img",
                      flac: "flac",
                      mp4: "mp4",
                    };
                    // Use dict/typeMap instead of if/else
                    return thumbnail[typeMap[ext]] || thumbnail.default;
                  })()}{" "}
                  <div className="inline-flex flex-col">
                    <label htmlFor={id}>{e.name}</label>
                    <div className="italic text-xs text-slate-500">
                      <TimeAgo
                        datetime={new Date(e.lastModified)}
                        title={new Date(e.lastModified).toISOString()}
                      />
                      {snap.editing_index === i ? " - Editing 🧪" : ""}
                    </div>
                  </div>
                </li>
              );
            })}
          </fieldset>
        </ul>
      </div>
      <div
        className={clsx("w-full h-screen flex flex-col gap-1 ", {
          hidden: !tasklist[snap.editing_index],
        })}
      >
        <div className="flex flex-row items-center gap-4 p-2">
          <div className="flex flex-col gap-1"></div>
          {(() => {
            const editingTask = tasklist[snap.editing_index];
            if (!editingTask || !editingTask.previewUrl) {
              return (
                <div className="h-[3em] w-[3em] flex items-center justify-center bg-slate-100 rounded text-slate-400">
                  <span className="text-xs">...</span>
                </div>
              );
            }
            const typeMap: Record<string, () => JSX.Element> = {
              mp4: () => (
                <video
                  src={editingTask.previewUrl}
                  className="h-[3em] w-[3em] inline object-contain rounded"
                  controls
                  muted
                />
              ),
              video: () => (
                <video
                  src={editingTask.previewUrl}
                  className="h-[3em] w-[3em] inline object-contain rounded"
                  controls
                  muted
                />
              ),
              flac: () => (
                <audio
                  src={editingTask.previewUrl}
                  className="h-[3em] w-[10em] inline rounded"
                  controls
                />
              ),
              audio: () => (
                <audio
                  src={editingTask.previewUrl}
                  className="h-[3em] w-[10em] inline rounded"
                  controls
                />
              ),
              img: () => (
                <img
                  src={editingTask.previewUrl}
                  className="h-[3em] w-[3em] inline object-contain rounded"
                  alt="Preview Editing Image"
                />
              ),
            };
            const ext =
              editingTask.file.name.split(".").pop()?.toLowerCase() || "";
            const extTypeMap: Record<string, keyof typeof typeMap> = {
              png: "img",
              jpg: "img",
              jpeg: "img",
              webp: "img",
              mp4: "mp4",
              flac: "flac",
              mp3: "audio",
            };
            let typeKey = extTypeMap[ext];
            if (!typeKey) {
              if (editingTask.file.type.includes("video")) typeKey = "video";
              else if (editingTask.file.type.includes("audio"))
                typeKey = "audio";
            }
            return typeKey && typeMap[typeKey]
              ? typeMap[typeKey]()
              : typeMap["img"]();
          })()}
          <div>
            <input
              type="text"
              name="editing_filename"
              className="input input-bordered input-sm"
              value={snapSync.editing_filename}
              onChange={(e) =>
                void (persistState.editing_filename = e.target.value)
              }
            />
          </div>

          <div>
            <button
              disabled={
                tryMinifyJson(snap.editing_workflow_json ?? "") ===
                tryMinifyJson(tasklist[snap.editing_index]?.workflowJson ?? "")
              }
              className="btn btn-primary"
              id="save-workflow"
              onClick={async () => {
                const workflow = tryMinifyJson(snap.editing_workflow_json);
                const modifiedMetadata = { workflow };
                await saveCurrentFile(modifiedMetadata);
              }}
            >
              Save workflow{" "}
              <span>
                {!workingDir
                  ? "(download)"
                  : snap.editing_filename === tasklist[snap.editing_index]?.name
                    ? "(overwrite)"
                    : "(save as)"}
              </span>
            </button>
          </div>
        </div>
        <Editor
          language="json"
          value={snap.editing_workflow_json ?? "{}"}
          onChange={(e) => {
            const content = e ?? "";
            persistState.editing_workflow_json = content;
            if (
              snap.autosave &&
              content !== tasklist[snap.editing_index]?.workflowJson
            ) {
              saveCurrentFile({ workflow: tryMinifyJson(content) });
            }
          }}
          className="w-[calc(100%-1px)] h-full"
          onValidate={(e) => console.log(e)}
          onMount={(editor) => setEditor(editor)}
        />
      </div>
      <span id="forkongithub">
        <a
          href="https://github.com/snomiao/ComfyUI-embeded-workflow-editor"
          target="_blank"
        >
          Fork me on GitHub
        </a>
      </span>
      <Toaster />
    </div>
  );

  async function saveCurrentFile(modifiedMetadata: { workflow: string }) {
    const file = tasklist[persistState.editing_index]?.file;
    if (!file) return;

    const filename = persistState.editing_filename || file.name;

    const buffer = await file.arrayBuffer();

    try {
      const newBuffer = setWorkflowInfo(buffer, file.type, modifiedMetadata);
      const fileToSave = new File([newBuffer], filename, { type: file.type });

      if (workingDir) {
        await writeToWorkingDir(workingDir, fileToSave);
      } else {
        download(fileToSave);
      }
    } catch (error) {
      const msg = `Error processing file: ${
        error instanceof Error ? error.message : String(error)
      }`;
      alert(msg);
      throw error;
    }
  }

  async function writeToWorkingDir(
    workingDir: FileSystemDirectoryHandle,
    file: File,
  ) {
    const h = await workingDir.getFileHandle(file.name, {
      create: true,
    });
    const w = await h.createWritable();
    await w.write(file);
    await w.close();
    await scanFilelist(workingDir);
  }

  async function scanFilelist(workingDir: FileSystemDirectoryHandle) {
    const aIter = workingDir.values() as AsyncIterable<FileSystemFileHandle>;
    const readed = (await sf(aIter)
      .filter((e) => e.kind === "file")
      .filter((e) => e.name.match(/\.(png|flac|webp|mp4|mp3)$/i))
      .map(async (e) => await e.getFile())
      .map(async (e) => await readWorkflowInfo(e as File))
      .filter(
        (e): e is Awaited<ReturnType<typeof readWorkflowInfo>> =>
          !!(e as Awaited<ReturnType<typeof readWorkflowInfo>>).workflowJson,
      )
      .toArray()) as Awaited<ReturnType<typeof readWorkflowInfo>>[];
    setTasklist(readed);
    if (snap.editing_index === -1) chooseNthFileToEdit(readed, 0);
    return readed;
  }
}

function fileListToArray(files1: FileList) {
  return Array(files1.length)
    .fill(0)
    .map((_, i) => i)
    .map((i) => files1.item(i))
    .flatMap((e) => (e ? [e] : []));
}

function download(file: File) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  a.click();
}

function tryMinifyJson(json: string) {
  try {
    return JSON.stringify(JSON.parse(json));
  } catch (_: unknown) {
    return json;
  }
}
function tryPrettyJson(json: string) {
  try {
    return JSON.stringify(JSON.parse(json), null, 2);
  } catch (_: unknown) {
    return json;
  }
}

function chooseNthFileToEdit(
  tasklist: Awaited<ReturnType<typeof readWorkflowInfo>>[],
  i: number,
) {
  if (!tasklist[i]) {
    persistState.editing_index = -1;
    return;
  }
  persistState.editing_index = i;
  persistState.editing_workflow_json = tryPrettyJson(tasklist[i].workflowJson!);
  persistState.editing_filename = tasklist[i].name!;
}
