import { describe, expect, it } from "vitest";
import type { Scheduler } from "./manager.js";
import { RoomManager } from "./manager.js";

class Clock implements Scheduler {
  now = 1_000_000;
  private nextId = 1;
  private tasks: { id: number; at: number; fn: () => void }[] = [];

  set(fn: () => void, ms: number): number {
    const id = this.nextId;
    this.nextId += 1;
    this.tasks.push({ id, at: this.now + ms, fn });
    return id;
  }

  clear(handle: unknown): void {
    this.tasks = this.tasks.filter((task) => task.id !== handle);
  }

  advance(ms: number): void {
    this.now += ms;
    let guard = 0;
    while (guard < 30) {
      guard += 1;
      const due = this.tasks
        .filter((task) => task.at <= this.now)
        .sort((a, b) => a.at - b.at || a.id - b.id);
      const task = due[0];
      if (!task) break;
      this.tasks = this.tasks.filter((entry) => entry.id !== task.id);
      task.fn();
    }
  }
}

function harness() {
  const clock = new Clock();
  const manager = new RoomManager({
    scheduler: clock,
    now: () => clock.now,
    lobbyGraceMs: 90_000,
    emptyRoomMs: 120_000,
    createSeed: () => 42,
  });
  return { clock, manager };
}

function openTable(count = 5) {
  const env = harness();
  const host = env.manager.createRoom({ name: "Host", turnTimerSeconds: 30 });
  if (!host.ok) throw new Error(host.error);
  const members = [host.data];
  for (let index = 2; index <= count; index += 1) {
    const joined = env.manager.joinRoom(host.data.code, `Mitglied ${index}`);
    if (!joined.ok) throw new Error(joined.error);
    members.push(joined.data);
  }
  return { ...env, code: host.data.code, members };
}

describe("Vereinsheim", () => {
  it("öffnet, füllt und startet nur mit fünf bereiten Mitgliedern", () => {
    const { manager, code, members } = openTable(4);
    expect(manager.setReady(code, members[0]!.playerId, true).ok).toBe(true);
    for (const member of members.slice(1)) expect(manager.setReady(code, member.playerId, true).ok).toBe(true);
    const early = manager.start(code, members[0]!.playerId);
    expect(early.ok).toBe(false);
    const fifth = manager.joinRoom(code, "Fünftes");
    if (!fifth.ok) throw new Error(fifth.error);
    expect(manager.start(code, members[0]!.playerId).ok).toBe(false);
    expect(manager.setReady(code, fifth.data.playerId, true).ok).toBe(true);
    const stranger = manager.start(code, fifth.data.playerId);
    expect(stranger.ok).toBe(false);
    expect(manager.start(code, members[0]!.playerId).ok).toBe(true);
    const game = manager.debugGame(code);
    expect(game?.players.map((player) => player.id)).toEqual([...members.map((member) => member.playerId), fifth.data.playerId]);
    expect(game?.phase).toBe("briefing");
    const liberal = game?.players.find((player) => player.role === "ehrliches_mitglied");
    if (!liberal) throw new Error("Kein ehrliches Mitglied");
    const view = manager.viewFor(code, liberal.id);
    expect(view?.game?.you.role).toBe("ehrliches_mitglied");
    const json = JSON.stringify(view);
    expect(json).not.toContain('"drawPile"');
    expect(json).not.toContain('"rng"');
    expect(json).not.toContain('"role":"nils"');
    expect(json).not.toContain('"role":"linientreuer"');
    expect(json).not.toContain(members[0]!.token);
    expect(view?.game?.turnSecondsLeft).toBe(30);
  });

  it("lehnt doppelte Namen, falsche Codes und den elften Stuhl ab", () => {
    const { manager, code } = openTable(10);
    expect(manager.joinRoom(code, "Mitglied 2").ok).toBe(false);
    expect(manager.joinRoom(code, "Noch eins").ok).toBe(false);
    expect(manager.joinRoom("OOO", "Name").ok).toBe(false);
    expect(manager.joinRoom("ZZZZ", "Name").ok).toBe(false);
    expect(manager.createRoom({ name: "X" }).ok).toBe(false);
  });

  it("übergibt den Vorstand und wirft nur in der Lobby raus", () => {
    const { manager, code, members } = openTable(5);
    expect(manager.kick(code, members[1]!.playerId, members[2]!.playerId).ok).toBe(false);
    const kicked = manager.kick(code, members[0]!.playerId, members[2]!.playerId);
    expect(kicked.ok).toBe(true);
    expect(manager.viewFor(code, members[2]!.playerId)).toBeNull();
    expect(manager.reconnect(members[2]!.token).ok).toBe(false);
    const left = manager.leave(code, members[0]!.playerId);
    expect(left.ok).toBe(true);
    const next = manager.viewFor(code, members[1]!.playerId);
    expect(next?.lobby.hostId).toBe(members[1]!.playerId);
    expect(manager.setOptions(code, members[3]!.playerId, { turnTimerSeconds: 45 }).ok).toBe(false);
    expect(manager.setOptions(code, members[1]!.playerId, { turnTimerSeconds: 45, sitzeMischen: true }).ok).toBe(true);
    expect(manager.viewFor(code, members[1]!.playerId)?.lobby.options).toEqual({
      turnTimerSeconds: 45,
      sitzeMischen: true,
      probeMitNpcs: false,
    });
  });

  it("verbindet mit demselben Ausweis wieder und lässt Züge nicht hängen", () => {
    const { manager, clock, code, members } = openTable(5);
    for (const member of members) manager.setReady(code, member.playerId, true);
    expect(manager.start(code, members[0]!.playerId).ok).toBe(true);
    const before = manager.debugGame(code);
    const you = manager.viewFor(code, members[0]!.playerId);
    expect(you?.game?.you.role).toBe(before?.players[0]?.role);
    manager.noteSocketGone("anderes-gerät");
    manager.attach(code, members[0]!.playerId, "sock-a");
    manager.noteSocketGone("sock-a");
    expect(manager.viewFor(code, members[0]!.playerId)?.lobby.players[0]?.connected).toBe(false);
    const again = manager.reconnect(members[0]!.token);
    expect(again.ok).toBe(true);
    if (again.ok) expect(again.data.playerId).toBe(members[0]!.playerId);
    manager.attach(code, members[0]!.playerId, "sock-b");
    expect(manager.viewFor(code, members[0]!.playerId)?.game?.you.role).toBe(before?.players[0]?.role);

    clock.advance(30_000);
    expect(manager.debugGame(code)?.phase).toBe("nominating");
    clock.advance(30_000);
    expect(manager.debugGame(code)?.electionTracker).toBe(1);
    const presidentId = manager.debugGame(code)?.players[manager.debugGame(code)!.presidentIndex]?.id;
    if (!presidentId) throw new Error("Kein Vorsitz");
    const bystander = members.find((member) => member.playerId !== presidentId);
    if (!bystander) throw new Error("Kein anderes Mitglied");
    expect(manager.act(code, bystander.playerId, { type: "nominate", chancellorId: members[1]!.playerId }).ok).toBe(false);
    expect(manager.act(code, presidentId, { type: "timeout" }).ok).toBe(false);
    const nominee = manager.debugGame(code)?.players.find((player) => player.id !== presidentId);
    expect(manager.act(code, presidentId, { type: "nominate", chancellorId: nominee!.id }).ok).toBe(true);
  });

  it("entfernt abwesende Lobby-Mitglieder und verlassene Sitzungen", () => {
    const lobby = openTable(5);
    lobby.manager.attach(lobby.code, lobby.members[4]!.playerId, "weg");
    lobby.manager.noteSocketGone("weg");
    lobby.clock.advance(89_000);
    expect(lobby.manager.viewFor(lobby.code, lobby.members[4]!.playerId)).not.toBeNull();
    lobby.clock.advance(1_000);
    expect(lobby.manager.viewFor(lobby.code, lobby.members[4]!.playerId)).toBeNull();
    expect(lobby.manager.hasRoom(lobby.code)).toBe(true);

    const table = openTable(5);
    for (const member of table.members) table.manager.setReady(table.code, member.playerId, true);
    expect(table.manager.start(table.code, table.members[0]!.playerId).ok).toBe(true);
    for (const member of table.members) {
      table.manager.attach(table.code, member.playerId, `s-${member.playerId}`);
      table.manager.noteSocketGone(`s-${member.playerId}`);
    }
    table.clock.advance(119_000);
    expect(table.manager.hasRoom(table.code)).toBe(true);
    table.clock.advance(1_000);
    expect(table.manager.hasRoom(table.code)).toBe(false);
  });

  it("füllt ein Probespiel mit Platzhaltern auf und lässt sie ziehen", () => {
    const { manager, clock, code, members } = openTable(1);
    expect(manager.start(code, members[0]!.playerId).ok).toBe(false);
    expect(manager.setOptions(code, members[0]!.playerId, { probeMitNpcs: true }).ok).toBe(true);
    const lobby = manager.viewFor(code, members[0]!.playerId);
    expect(lobby?.lobby.npcFillers).toHaveLength(4);
    expect(lobby?.lobby.canStart).toBe(false);
    expect(manager.setReady(code, members[0]!.playerId, true).ok).toBe(true);
    expect(manager.start(code, members[0]!.playerId).ok).toBe(true);

    const game = manager.debugGame(code);
    expect(game?.players).toHaveLength(5);
    expect(game?.players.filter((player) => player.npc)).toHaveLength(4);
    expect(game?.phase).toBe("briefing");
    const humanAck = game?.briefingAck[members[0]!.playerId];
    expect(humanAck).toBeFalsy();
    for (const player of game?.players ?? []) {
      if (player.npc) expect(game?.briefingAck[player.id]).toBe(true);
    }

    expect(manager.act(code, members[0]!.playerId, { type: "ack_briefing" }).ok).toBe(true);
    const after = manager.debugGame(code);
    const president = after?.players[after.presidentIndex];
    if (!president || !after) throw new Error("Kein Vorsitz");
    if (president.npc) expect(after.phase).toBe("voting");
    else expect(after.phase).toBe("nominating");

    const npc = after.players.find((player) => player.npc);
    if (!npc) throw new Error("Kein Platzhalter");
    expect(manager.act(code, npc.id, { type: "ack_briefing" }).ok).toBe(false);

    const view = manager.viewFor(code, members[0]!.playerId);
    expect(view?.game?.players.filter((player) => player.npc)).toHaveLength(4);
    const json = JSON.stringify(view);
    expect(json).not.toContain('"drawPile"');
    if (view?.game?.you.role === "ehrliches_mitglied") {
      expect(json).not.toContain('"role":"nils"');
      expect(json).not.toContain('"role":"linientreuer"');
    }

    manager.attach(code, members[0]!.playerId, "solo");
    manager.noteSocketGone("solo");
    clock.advance(119_000);
    expect(manager.hasRoom(code)).toBe(true);
    clock.advance(1_000);
    expect(manager.hasRoom(code)).toBe(false);
  });
});
