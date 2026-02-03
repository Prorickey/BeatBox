import type { BeatboxClient } from "../structures/Client";
import type { Command } from "../types";

// Music commands
import * as twentyFourSeven from "../commands/music/247";
import * as favorite from "../commands/music/favorite";
import * as favorites from "../commands/music/favorites";
import * as filter from "../commands/music/filter";
import * as forward from "../commands/music/forward";
import * as join from "../commands/music/join";
import * as lyrics from "../commands/music/lyrics";
import * as move from "../commands/music/move";
import * as nowplaying from "../commands/music/nowplaying";
import * as pause from "../commands/music/pause";
import * as play from "../commands/music/play";
import * as playlist from "../commands/music/playlist";
import * as playtop from "../commands/music/playtop";
import * as queue from "../commands/music/queue";
import * as remove from "../commands/music/remove";
import * as removedupes from "../commands/music/removedupes";
import * as repeat from "../commands/music/repeat";
import * as requestchannel from "../commands/music/requestchannel";
import * as requeue from "../commands/music/requeue";
import * as rewind from "../commands/music/rewind";
import * as savequeue from "../commands/music/savequeue";
import * as loadqueue from "../commands/music/loadqueue";
import * as savedqueues from "../commands/music/savedqueues";
import * as deletequeue from "../commands/music/deletequeue";
import * as search from "../commands/music/search";
import * as seek from "../commands/music/seek";
import * as setdj from "../commands/music/setdj";
import * as shuffle from "../commands/music/shuffle";
import * as skip from "../commands/music/skip";
import * as stats from "../commands/music/stats";
import * as stop from "../commands/music/stop";
import * as volume from "../commands/music/volume";
import * as leavecleanup from "../commands/music/leavecleanup";

// Utility commands
import * as feedback from "../commands/utility/feedback";
import * as help from "../commands/utility/help";

const commands: { module: Command; category: string }[] = [
  // Music
  { module: twentyFourSeven, category: "music" },
  { module: favorite, category: "music" },
  { module: favorites, category: "music" },
  { module: filter, category: "music" },
  { module: forward, category: "music" },
  { module: join, category: "music" },
  { module: lyrics, category: "music" },
  { module: move, category: "music" },
  { module: nowplaying, category: "music" },
  { module: pause, category: "music" },
  { module: play, category: "music" },
  { module: playlist, category: "music" },
  { module: playtop, category: "music" },
  { module: queue, category: "music" },
  { module: remove, category: "music" },
  { module: removedupes, category: "music" },
  { module: repeat, category: "music" },
  { module: requestchannel, category: "music" },
  { module: requeue, category: "music" },
  { module: rewind, category: "music" },
  { module: savequeue, category: "music" },
  { module: loadqueue, category: "music" },
  { module: savedqueues, category: "music" },
  { module: deletequeue, category: "music" },
  { module: search, category: "music" },
  { module: seek, category: "music" },
  { module: setdj, category: "music" },
  { module: shuffle, category: "music" },
  { module: skip, category: "music" },
  { module: stats, category: "music" },
  { module: stop, category: "music" },
  { module: volume, category: "music" },
  { module: leavecleanup, category: "music" },

  // Utility
  { module: feedback, category: "utility" },
  { module: help, category: "utility" },
];

export async function loadCommands(client: BeatboxClient) {
  for (const { module, category } of commands) {
    if ("data" in module && "execute" in module) {
      module.category = category;
      client.commands.set(module.data.name, module);
      console.log(`Loaded command: ${module.data.name}`);
    }
  }
}
