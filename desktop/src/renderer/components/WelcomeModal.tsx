import {
  Button,
  Link,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
} from "@nextui-org/react";
import { useEffect, useState } from "react";

interface WelcomeModalProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export function WelcomeModal({ isOpen: externalIsOpen, onClose }: WelcomeModalProps) {
  // Internal state to handle the modal if no external control is provided
  const [internalIsOpen, setInternalIsOpen] = useState(true);

  // If external control is provided, use that, otherwise use internal state
  const isOpen = externalIsOpen !== undefined ? externalIsOpen : internalIsOpen;

  const handleClose = () => {
    if (onClose) {
      onClose();
    } else {
      setInternalIsOpen(false);
    }

    // Save to localStorage so we don't show it again in this session
    localStorage.setItem("welcomeModalShown", "true");
  };

  // Check if the modal has been shown before
  useEffect(() => {
    const hasBeenShown = localStorage.getItem("welcomeModalShown");
    if (hasBeenShown === "true" && externalIsOpen === undefined) {
      setInternalIsOpen(false);
    }
  }, [externalIsOpen]);

  return (
    <Modal
      className="witch-bolt"
      isOpen={isOpen}
      onClose={handleClose}
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
            <ModalHeader className="flex flex-col gap-1">Welcome to Geomancer</ModalHeader>
            <ModalBody className="flex flex-col gap-4">
              <h1 className="text-xl font-bold">
                Hello! This is Geomancer, a project that aims to be a Google Earth for your fantasy
                worlds.
              </h1>
              <div className="flex flex-col gap-4">
                <h2 className="text-lg font-bold">Features</h2>
                <p>
                  You will be able to generate verisimilitudinous terrains, fantastic worlds in many
                  shapes (donuts, halos, diskworlds), edit them, and place searchable points of
                  interest.
                </p>
                <p>
                  Dungeonmasters will be able to download regional and local maps, and share
                  multiplayer links with their players.
                </p>
                <p>
                  It will be distributed via Steam and the web, but for now you can find it on this
                  subdomain.
                </p>
              </div>

              <div className="flex flex-col gap-4">
                <h2 className="text-lg font-bold">News</h2>
                <p>
                  Recently I've added some map modes that you can play with, as well as shadows.
                </p>
                <p>Next up, I'll be working on tectonic plate collisions</p>
              </div>

              <Link href="https://bsky.app/profile/kenny.wtf">
                Follow my Bluesky for realtime updates!
              </Link>
            </ModalBody>
            <ModalFooter>
              <Button color="primary" variant="solid" onPress={onClose} className="text-foreground">
                Explore
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
