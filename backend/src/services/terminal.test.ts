import { describe, expect, it } from "vitest";
import { screenCommand } from "./terminal.service.js";

/**
 * The screen exists to stop a small set of unambiguously catastrophic commands
 * before they reach a production shell. It is deliberately narrow: anyone with
 * shell access can defeat any pattern, so a filter that tries to be clever
 * gives false confidence while breaking legitimate work. These tests pin both
 * halves of that — what must be refused, and what must not be.
 */

describe("Refused commands", () => {
  it("refuses recursive forced deletion in either flag order", () => {
    expect(screenCommand("rm -rf /").allowed).toBe(false);
    expect(screenCommand("rm -fr /var/www").allowed).toBe(false);
    expect(screenCommand("rm -r -f /srv").allowed).toBe(false);
    expect(screenCommand("sudo rm -rf --no-preserve-root /").allowed).toBe(false);
  });

  it("refuses filesystem creation", () => {
    expect(screenCommand("mkfs.ext4 /dev/sda1").allowed).toBe(false);
    expect(screenCommand("mkfs /dev/nvme0n1").allowed).toBe(false);
  });

  it("refuses raw writes to a block device", () => {
    expect(screenCommand("dd if=/dev/zero of=/dev/sda bs=1M").allowed).toBe(false);
    expect(screenCommand("cat image > /dev/nvme0n1").allowed).toBe(false);
  });

  it("refuses a fork bomb", () => {
    expect(screenCommand(":(){ :|:& };:").allowed).toBe(false);
  });

  it("refuses changing the host power state", () => {
    expect(screenCommand("shutdown -h now").allowed).toBe(false);
    expect(screenCommand("sudo reboot").allowed).toBe(false);
  });

  it("refuses dropping a database", () => {
    expect(screenCommand('psql -c "DROP DATABASE production"').allowed).toBe(false);
  });

  it("explains what was refused", () => {
    const result = screenCommand("rm -rf /");
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("Recursive forced deletion");
  });
});

describe("Ordinary commands", () => {
  it("allows the everyday ones", () => {
    for (const command of [
      "ls -la", "cd /var/www", "git status", "git pull --rebase",
      "docker compose up -d", "systemctl restart nginx", "tail -f app.log",
      "npm ci", "cat /etc/hostname", "df -h", "ps aux | grep node",
    ]) {
      expect(screenCommand(command), command).toMatchObject({ allowed: true });
    }
  });

  it("allows deletions that are not both recursive and forced", () => {
    // These are ordinary and must keep working; only the combination that
    // wipes a tree without prompting is refused.
    expect(screenCommand("rm file.txt").allowed).toBe(true);
    expect(screenCommand("rm -r build").allowed).toBe(true);
    expect(screenCommand("rm -f stale.lock").allowed).toBe(true);
  });

  it("allows words that merely contain a refused term", () => {
    // "reboot" inside a filename or a message is not a power state change.
    expect(screenCommand("git commit -m 'fix reboot handling'").allowed).toBe(true);
    expect(screenCommand("grep shutdown /var/log/syslog").allowed).toBe(true);
  });

  it("allows an empty line", () => {
    expect(screenCommand("").allowed).toBe(true);
    expect(screenCommand("   ").allowed).toBe(true);
  });
});
