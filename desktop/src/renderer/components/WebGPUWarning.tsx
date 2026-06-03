import {
  Button,
  Code,
  Link,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Snippet,
} from "@nextui-org/react";
import { useEffect, useState } from "react";

type WebGPUStatus =
  | { kind: "pending" }
  | { kind: "ok" }
  | { kind: "missing-navigator" }
  | { kind: "no-adapter" }
  | { kind: "device-failed"; message: string };

async function probeWebGPU(): Promise<WebGPUStatus> {
  if (typeof navigator === "undefined" || !navigator.gpu) {
    return { kind: "missing-navigator" };
  }
  try {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      return { kind: "no-adapter" };
    }
    // Requesting the device validates that the GPU process can actually
    // hand us one; some Linux/driver combos return an adapter then fail here.
    await adapter.requestDevice();
    return { kind: "ok" };
  } catch (error) {
    return {
      kind: "device-failed",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

function getPlatform(): NodeJS.Platform | "unknown" {
  // Prefer the value injected by the preload bridge; fall back to a
  // best-effort UA sniff so this component still works in `pnpm web:dev`.
  if (typeof window !== "undefined" && window.IPCBridge?.platform) {
    return window.IPCBridge.platform;
  }
  if (typeof navigator !== "undefined") {
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes("linux")) return "linux";
    if (ua.includes("mac")) return "darwin";
    if (ua.includes("windows")) return "win32";
  }
  return "unknown";
}

/**
 * Probes WebGPU on mount and, if it's unavailable, shows a modal explaining
 * the cause. On Linux we additionally list the driver/package requirements
 * since that's the platform where this is most likely to fail.
 */
export function WebGPUWarning() {
  const [status, setStatus] = useState<WebGPUStatus>({ kind: "pending" });
  const [dismissed, setDismissed] = useState(false);
  const platform = getPlatform();

  useEffect(() => {
    let cancelled = false;
    void probeWebGPU().then((result) => {
      if (!cancelled) {
        setStatus(result);
        if (result.kind !== "ok") {
          // Surface in the console too so it shows up in user-submitted logs.
          console.error("[WebGPU] unavailable:", result);
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const shouldShow = !dismissed && status.kind !== "pending" && status.kind !== "ok";
  if (!shouldShow) {
    return null;
  }

  const isLinux = platform === "linux";

  const reasonHeadline = (() => {
    switch (status.kind) {
      case "missing-navigator":
        return "WebGPU isn't available in this build";
      case "no-adapter":
        return "No WebGPU adapter could be found";
      case "device-failed":
        return "Your GPU was detected but couldn't be initialized";
      default:
        return "WebGPU is unavailable";
    }
  })();

  return (
    <Modal
      isOpen
      onClose={() => setDismissed(true)}
      backdrop="blur"
      classNames={{
        base: "border border-dark rounded-large",
        header: "border-b border-dark",
        body: "py-6",
        footer: "border-t border-dark",
        closeButton: "hover:bg-primary/10 active:bg-primary/20",
        backdrop: "bg-black/50",
      }}
    >
      <ModalContent className="bg-background text-foreground">
        {(onClose) => (
          <>
            <ModalHeader className="flex flex-col gap-1">{reasonHeadline}</ModalHeader>
            <ModalBody className="flex flex-col gap-4">
              <p>
                Geomancer uses WebGPU for terrain simulation (erosion, flood fill, elevation).
                Without it, those features will be disabled or fall back to slower paths.
              </p>

              {status.kind === "device-failed" && (
                <Code className="whitespace-pre-wrap break-all">{status.message}</Code>
              )}

              {isLinux ? (
                <div className="flex flex-col gap-3">
                  <h2 className="text-lg font-bold">Linux requirements</h2>
                  <p>
                    WebGPU on Linux uses the Vulkan backend. You need a Vulkan&nbsp;1.1+ capable GPU
                    and driver:
                  </p>
                  <ul className="list-disc pl-6 flex flex-col gap-1">
                    <li>
                      <strong>Intel / AMD:</strong> Mesa 22.2 or newer (Mesa 23+ recommended).
                    </li>
                    <li>
                      <strong>NVIDIA:</strong> proprietary driver 525 or newer.
                    </li>
                    <li>
                      A working Vulkan loader and ICD must be installed.
                    </li>
                  </ul>

                  <p>On Debian / Ubuntu:</p>
                  <Snippet symbol="$" variant="bordered">
                    sudo apt install libvulkan1 mesa-vulkan-drivers vulkan-tools
                  </Snippet>

                  <p>On Fedora:</p>
                  <Snippet symbol="$" variant="bordered">
                    sudo dnf install vulkan-loader mesa-vulkan-drivers vulkan-tools
                  </Snippet>

                  <p>On Arch:</p>
                  <Snippet symbol="$" variant="bordered">
                    sudo pacman -S vulkan-icd-loader vulkan-tools
                  </Snippet>

                  <p>
                    Verify your Vulkan setup with <Code>vulkaninfo --summary</Code>. You should see
                    at least one physical device listed.
                  </p>

                  <p className="text-sm opacity-80">
                    Still not working? Try launching Geomancer from a terminal and check the GPU
                    process logs, or open{" "}
                    <Link
                      href="https://github.com/kenjinp/geomancer/issues"
                      isExternal
                      showAnchorIcon
                    >
                      an issue
                    </Link>{" "}
                    with the output of <Code>vulkaninfo --summary</Code> attached.
                  </p>
                </div>
              ) : (
                <p>
                  WebGPU should be enabled by default on{" "}
                  {platform === "darwin" ? "macOS" : platform === "win32" ? "Windows" : "this platform"}
                  . Try updating your GPU drivers and restarting Geomancer. If the problem persists,{" "}
                  <Link
                    href="https://github.com/kenjinp/geomancer/issues"
                    isExternal
                    showAnchorIcon
                  >
                    open an issue
                  </Link>
                  .
                </p>
              )}
            </ModalBody>
            <ModalFooter>
              <Button color="primary" variant="solid" onPress={onClose} className="text-foreground">
                Continue anyway
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
