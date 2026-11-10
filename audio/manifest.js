// Recorded sounds and music the game uses instead of its built-in synthesized ones.
// To add or swap one: put the file in audio/sfx/ or audio/music/ (.ogg, .mp3 or .wav),
// then list it here. Anything missing or not listed falls back to the built-in sound.
// Credit every file in audio/CREDITS.md (and saucestore.json).
window.BOOM_AUDIO = {
  sfx: {
    // name: which game sound it replaces. files: picked at random each time. vol: 0 to 1.
    // mix: true plays the file AND the built-in sound together.
    boom:   { files: ['explosion.ogg', 'explosion_2.ogg'], vol: 0.55 },
    nuke:   { files: ['big_explosion.ogg'], vol: 1, mix: true },
    rocket: { files: ['rocket.ogg'], vol: 0.3 },
    throw:  { files: ['throw.ogg'], vol: 0.6 },
    pickup: { files: ['pickup.ogg'], vol: 0.55 },
    jump:   { files: ['jump.ogg'], vol: 0.3 },
    rescue: { files: ['jingle_win.ogg'], vol: 0.6 },
    slam:   { files: ['impact.ogg'], vol: 0.7, mix: true },
  },
  music: {
    // menu: title and join screens. level: during levels (level1 to level4 override it per level).
    // boss: the MEGA GRUMP fight. Your own songs (e.g. made with Suno) drop in here too.
    menu: 'menu.ogg',
    level: 'level.ogg',
    boss: 'boss.ogg',
    volume: 0.45,
  },
};
