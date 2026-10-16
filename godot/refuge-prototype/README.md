# Mayuna Refuge · Godot prototype

This is the Godot 4 source project for the Companion Core refuge. It reuses the
Mayuna portrait and the existing tree GLB. The `HTTP...` requests call the
Companion Core's existing state, affection and chat routes; Core remains the
only writer of identity, memory, XP, bond and evolution.

## Run in Godot

Open this folder in Godot 4.3 or newer and run `main.tscn`. Start the local Core
with `MAYUNA_REMOTE_ORIGIN=http://127.0.0.1:4173`, sign in through the local web
interface, and create a one-time pairing code in **Configurações → Conexão
online**. Enter that eight-digit code in the Godot window. The code expires in
two minutes; Godot keeps the resulting short-lived bearer token in memory only.
If the Core runs at another address, set both `core_base_url` and
`pairing_origin` on the root node in the Inspector, and configure
`MAYUNA_REMOTE_ORIGIN` to the exact same origin.

The renderer is configured for Compatibility (WebGL 2) to support a later HTML5
export. The current workspace has no Godot executable or HTML5 export templates,
so this source project has not yet been imported, run, or exported here. The
browser-playable page at `/refuge-godot.html` is a Three.js preview that shares
the garden layout/navigation and Core APIs; it is not a Godot HTML5 export.

## Current animation coverage

The Mayuna asset supplied with the project is one transparent 1254 × 1254
portrait. It has no animation frames. The browser preview adds a restrained bob
and horizontal flip during movement; the Godot scene adds a bob while walking.
Eight-direction walk frames and authored idle, affection, attack, lie, faint,
and defend cycles are still missing. Movement currently uses body collision to
slide around the pond, sanctuary and tree trunks.
