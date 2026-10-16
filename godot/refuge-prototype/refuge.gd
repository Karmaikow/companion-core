extends Node3D
## Godot-native scene prototype. The production Companion Core remains the owner
## of identity, memory, XP, bond, and conversation persistence.

@export var core_base_url := "http://127.0.0.1:4173"
@export var pairing_origin := "http://127.0.0.1:4173"

var companion: CharacterBody3D
var camera: Camera3D
var target := Vector3.ZERO
var is_walking := false
var client_state: Dictionary = {}
var status_label: Label
var stats_label: Label
var chat_log: RichTextLabel
var chat_input: LineEdit
var state_http: HTTPRequest
var pairing_http: HTTPRequest
var affection_http: HTTPRequest
var chat_http: HTTPRequest
var pairing_input: LineEdit
var access_token := ""
var core_material: StandardMaterial3D
var water_material: StandardMaterial3D


func _ready() -> void:
	_build_world()
	_build_companion()
	_build_ui()
	_setup_http()
	_request_state()


func _build_world() -> void:
	var world_environment := WorldEnvironment.new()
	var environment := Environment.new()
	environment.background_mode = Environment.BG_COLOR
	environment.background_color = Color("9fb9b3")
	environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	environment.ambient_light_color = Color("d4e1c2")
	environment.ambient_light_energy = 0.8
	world_environment.environment = environment
	add_child(world_environment)

	var sun := DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-48.0, -32.0, 0.0)
	sun.light_color = Color("fff0c9")
	sun.light_energy = 1.3
	sun.shadow_enabled = true
	add_child(sun)

	camera = Camera3D.new()
	camera.name = "RefugeCamera"
	camera.projection = Camera3D.PROJECTION_ORTHOGONAL
	camera.current = true
	camera.size = 24.0
	camera.position = Vector3(18.0, 22.0, 25.0)
	camera.look_at(Vector3(0.0, 0.0, 1.0))
	add_child(camera)

	var floor_body := StaticBody3D.new()
	floor_body.name = "WalkableGarden"
	floor_body.position.y = -0.4
	var floor_shape := CollisionShape3D.new()
	var floor_box := BoxShape3D.new()
	floor_box.size = Vector3(36.0, 0.8, 36.0)
	floor_shape.shape = floor_box
	floor_body.add_child(floor_shape)
	var floor_mesh := MeshInstance3D.new()
	var floor_box_mesh := BoxMesh.new()
	floor_box_mesh.size = floor_box.size
	floor_mesh.mesh = floor_box_mesh
	floor_mesh.material_override = _material("657f4a")
	floor_body.add_child(floor_mesh)
	add_child(floor_body)

	# Stone walkway: a sequence of broad, slightly varied stones through the garden.
	for i in range(25):
		var t := float(i) / 24.0
		var z := -12.0 + t * 24.0
		var x := -1.0 + sin((z + 8.0) * 0.20) * 1.9
		for lane in range(3):
			var stone := MeshInstance3D.new()
			var block := BoxMesh.new()
			block.size = Vector3(0.72, 0.10, 0.62)
			stone.mesh = block
			stone.position = Vector3(x + (lane - 1) * 0.72, 0.03, z)
			stone.rotation.y = sin(float(i * 5 + lane)) * 0.08
			stone.material_override = _material(["c8bd9d", "b9ad8b", "d5c8a5"][posmod(i + lane, 3)])
			add_child(stone)

	# A pond and sanctuary are static colliders, so Mayuna's body slides around them.
	_add_obstacle(Vector3(6.0, 0.0, 2.0), Vector3(6.8, 0.30, 5.0), "4e9fa4")
	_add_obstacle(Vector3(-1.0, 1.4, -8.0), Vector3(5.8, 2.8, 4.2), "d5cfb2")
	_add_sanctuary()
	_add_tree(Vector3(-10.0, 0.0, -9.0), 1.15)
	_add_tree(Vector3(10.0, 0.0, -7.0), 1.20)
	_add_tree(Vector3(-10.0, 0.0, 7.0), 1.10)
	_add_tree(Vector3(11.0, 0.0, 9.0), 1.20)


func _build_companion() -> void:
	companion = CharacterBody3D.new()
	companion.name = "Mayuna"
	companion.position = Vector3(0.0, 0.0, 5.0)
	var body_shape := CollisionShape3D.new()
	var capsule := CapsuleShape3D.new()
	capsule.radius = 0.48
	capsule.height = 1.55
	body_shape.shape = capsule
	body_shape.position.y = 0.75
	companion.add_child(body_shape)

	var sprite := Sprite3D.new()
	sprite.name = "MayunaSprite"
	sprite.texture = load("res://assets/mayuna.png") as Texture2D
	sprite.pixel_size = 0.0045
	sprite.position.y = 1.2
	sprite.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	sprite.alpha_cut = SpriteBase3D.ALPHA_CUT_DISCARD
	sprite.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	companion.add_child(sprite)
	companion.set_meta("mayuna", true)
	add_child(companion)
	target = companion.position


func _build_ui() -> void:
	var layer := CanvasLayer.new()
	add_child(layer)
	var root := Control.new()
	root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	layer.add_child(root)

	var header := PanelContainer.new()
	header.position = Vector2(18, 16)
	header.custom_minimum_size = Vector2(350, 76)
	root.add_child(header)
	var header_box := VBoxContainer.new()
	header.add_child(header_box)
	var title := Label.new()
	title.text = "✦  MAYUNA · REFÚGIO"
	title.add_theme_font_size_override("font_size", 18)
	header_box.add_child(title)
	stats_label = Label.new()
	stats_label.text = "Conectando ao Core…"
	header_box.add_child(stats_label)

	var status_panel := PanelContainer.new()
	status_panel.anchor_left = 0.5
	status_panel.anchor_right = 0.5
	status_panel.offset_left = -170
	status_panel.offset_right = 170
	status_panel.offset_top = 102
	status_panel.offset_bottom = 140
	root.add_child(status_panel)
	var status_box := VBoxContainer.new()
	status_panel.add_child(status_box)
	status_label = Label.new()
	status_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	status_label.text = "Conecte sua Companion para carregar o refúgio."
	status_box.add_child(status_label)
	var pairing_row := HBoxContainer.new()
	status_box.add_child(pairing_row)
	pairing_input = LineEdit.new()
	pairing_input.placeholder_text = "Código de 8 dígitos do Core"
	pairing_input.max_length = 8
	pairing_input.custom_minimum_size = Vector2(220, 36)
	pairing_input.text_submitted.connect(_connect_core)
	pairing_row.add_child(pairing_input)
	var pairing_button := Button.new()
	pairing_button.text = "Conectar"
	pairing_button.pressed.connect(func(): _connect_core(pairing_input.text))
	pairing_row.add_child(pairing_button)

	var chat_panel := PanelContainer.new()
	chat_panel.anchor_left = 1.0
	chat_panel.anchor_right = 1.0
	chat_panel.anchor_top = 1.0
	chat_panel.anchor_bottom = 1.0
	chat_panel.offset_left = -372
	chat_panel.offset_right = -18
	chat_panel.offset_top = -470
	chat_panel.offset_bottom = -18
	root.add_child(chat_panel)
	var chat_box := VBoxContainer.new()
	chat_panel.add_child(chat_box)
	var chat_title := Label.new()
	chat_title.text = "CONVERSA · MAYUNA"
	chat_box.add_child(chat_title)
	chat_log = RichTextLabel.new()
	chat_log.bbcode_enabled = false
	chat_log.size_flags_vertical = Control.SIZE_EXPAND_FILL
	chat_log.custom_minimum_size = Vector2(330, 250)
	chat_log.text = "Mayuna: Olá! Vamos conhecer a clareira?\n"
	chat_box.add_child(chat_log)
	chat_input = LineEdit.new()
	chat_input.placeholder_text = "Converse com Mayuna…"
	chat_input.max_length = 2000
	chat_input.text_submitted.connect(_send_chat)
	chat_box.add_child(chat_input)

	var hint := Label.new()
	hint.anchor_left = 0.5
	hint.anchor_right = 0.5
	hint.anchor_top = 1.0
	hint.anchor_bottom = 1.0
	hint.offset_left = -220
	hint.offset_right = 220
	hint.offset_top = -48
	hint.offset_bottom = -18
	hint.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	hint.text = "Clique ou toque no chão para caminhar · em Mayuna para carinho"
	root.add_child(hint)


func _setup_http() -> void:
	state_http = HTTPRequest.new()
	pairing_http = HTTPRequest.new()
	affection_http = HTTPRequest.new()
	chat_http = HTTPRequest.new()
	add_child(state_http)
	add_child(pairing_http)
	add_child(affection_http)
	add_child(chat_http)
	pairing_http.request_completed.connect(_on_pairing_response)
	state_http.request_completed.connect(_on_state_response)
	affection_http.request_completed.connect(_on_affection_response)
	chat_http.request_completed.connect(_on_chat_response)


func _request_state() -> void:
	if access_token.is_empty():
		_set_status("Gere um código no Core local e conecte acima.")
		return
	var error := _authorized_request(state_http, "/api/remote/state", HTTPClient.METHOD_GET)
	if error != OK:
		_set_status("Não consegui conectar ao Core local.")


func _connect_core(code: String) -> void:
	var clean := code.strip_edges()
	if not clean.is_valid_int() or clean.length() != 8 or pairing_http.get_http_client_status() == HTTPClient.STATUS_REQUESTING:
		_set_status("Informe o código de pareamento de 8 dígitos.")
		return
	var headers := PackedStringArray(["Content-Type: application/json", "Origin: " + pairing_origin])
	var error := pairing_http.request(core_base_url + "/api/remote/connect", headers, HTTPClient.METHOD_POST, JSON.stringify({"code": clean}))
	if error == OK:
		_set_status("Conectando ao Core…")


func _on_pairing_response(result: int, code: int, _headers: PackedStringArray, body: PackedByteArray) -> void:
	var value := _decode(body)
	if result != HTTPRequest.RESULT_SUCCESS or code != 200 or not value.has("token"):
		_set_status(str(value.get("error", "Pareamento falhou. Confira o código e a origem configurada.")))
		return
	access_token = str(value.get("token", ""))
	pairing_input.clear()
	pairing_input.editable = false
	_request_state()


func _authorized_request(client: HTTPRequest, route: String, method: HTTPClient.Method, payload := "") -> Error:
	var headers := PackedStringArray(["Authorization: Bearer " + access_token, "Origin: " + pairing_origin])
	if not payload.is_empty():
		headers.append("Content-Type: application/json")
	return client.request(core_base_url + route, headers, method, payload)


func _on_state_response(result: int, code: int, _headers: PackedStringArray, body: PackedByteArray) -> void:
	if result != HTTPRequest.RESULT_SUCCESS or code != 200:
		_set_status("Conexão recusada. Gere um novo código no Core local e conecte novamente.")
		return
	_apply_state(_decode(body))
	_set_status("A clareira está pronta. Toque no chão para explorar.")


func _apply_state(value: Dictionary) -> void:
	client_state = value
	var core: Dictionary = value.get("core", {})
	var combat: Dictionary = value.get("combat", {})
	var bond: Dictionary = value.get("bond", {})
	var memories: Array = value.get("memories", [])
	stats_label.text = "Core %s · %s/%s XP  |  Combate %s · %s/%s XP  |  Vínculo %s  |  %s memórias" % [str(core.get("level", 1)), str(core.get("xp", 0)), str(core.get("xpToNextLevel", 100)), str(combat.get("level", 1)), str(combat.get("xp", 0)), str(combat.get("xpToNextLevel", 100)), str(bond.get("value", 0)), str(memories.size())]


func _unhandled_input(event: InputEvent) -> void:
	var screen_position := Vector2.ZERO
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and event.pressed:
		screen_position = event.position
	elif event is InputEventScreenTouch and event.pressed:
		screen_position = event.position
	else:
		return
	var from := camera.project_ray_origin(screen_position)
	var direction := camera.project_ray_normal(screen_position)
	var query := PhysicsRayQueryParameters3D.create(from, from + direction * 200.0)
	query.collide_with_areas = true
	var hit := get_world_3d().direct_space_state.intersect_ray(query)
	if hit.is_empty():
		return
	var collider: Object = hit.get("collider")
	if collider is Node and collider.has_meta("mayuna"):
		_register_affection()
	elif absf(hit.position.x) < 15.0 and absf(hit.position.z) < 15.0:
		target = hit.position
		target.y = 0.0
		is_walking = true
		_set_status("Mayuna está caminhando…")


func _physics_process(delta: float) -> void:
	if not is_walking:
		return
	var offset := target - companion.position
	offset.y = 0.0
	if offset.length() < 0.14:
		is_walking = false
		companion.velocity = Vector3.ZERO
		_set_status("Mayuna chegou ao destino.")
		return
	var direction := offset.normalized()
	companion.velocity = direction * 3.0
	companion.move_and_slide()
	var sprite := companion.get_node("MayunaSprite") as Sprite3D
	sprite.position.y = 1.2 + absf(sin(Time.get_ticks_msec() * 0.014)) * 0.12


func _register_affection() -> void:
	if client_state.is_empty() or affection_http.get_http_client_status() == HTTPClient.STATUS_REQUESTING:
		return
	var id: String = client_state.get("identity", {}).get("id", "")
	var error := _authorized_request(affection_http, "/api/remote/interaction", HTTPClient.METHOD_POST, JSON.stringify({"id": id}))
	if error == OK:
		_set_status("Um carinho para Mayuna…")


func _on_affection_response(result: int, code: int, _headers: PackedStringArray, body: PackedByteArray) -> void:
	if result == HTTPRequest.RESULT_SUCCESS and code == 200:
		var value := _decode(body)
		_apply_state(value.get("state", {}))
		_set_status("Mayuna adorou o carinho. O vínculo foi salvo no Core.")
	else:
		_set_status("Não foi possível registrar o carinho no Core.")


func _send_chat(message: String) -> void:
	var clean := message.strip_edges()
	if clean.is_empty() or client_state.is_empty() or chat_http.get_http_client_status() == HTTPClient.STATUS_REQUESTING:
		return
	chat_log.append_text("Você: %s\n" % clean)
	chat_input.clear()
	var error := _authorized_request(chat_http, "/api/remote/chat", HTTPClient.METHOD_POST, JSON.stringify({"message": clean}))
	if error != OK:
		_set_status("Não consegui enviar a mensagem ao Core.")


func _on_chat_response(result: int, code: int, _headers: PackedStringArray, body: PackedByteArray) -> void:
	if result != HTTPRequest.RESULT_SUCCESS or code != 200:
		_set_status("O Core não respondeu à conversa. Tente novamente.")
		return
	var value := _decode(body)
	chat_log.append_text("Mayuna: %s\n" % str(value.get("response", "Estou aqui!")))
	_apply_state(value.get("state", {}))
	_set_status("Conversa e memórias guardadas no Core.")


func _decode(body: PackedByteArray) -> Dictionary:
	var parsed: Variant = JSON.parse_string(body.get_string_from_utf8())
	return parsed if parsed is Dictionary else {}


func _set_status(message: String) -> void:
	if is_instance_valid(status_label):
		status_label.text = message


func _add_obstacle(position: Vector3, size: Vector3, color: String) -> StaticBody3D:
	var obstacle := StaticBody3D.new()
	obstacle.position = position
	var shape_node := CollisionShape3D.new()
	var shape := BoxShape3D.new()
	shape.size = size
	shape_node.shape = shape
	obstacle.add_child(shape_node)
	var visual := MeshInstance3D.new()
	var mesh := BoxMesh.new()
	mesh.size = size
	visual.mesh = mesh
	visual.material_override = _material(color)
	obstacle.add_child(visual)
	add_child(obstacle)
	return obstacle


func _add_sanctuary() -> void:
	var temple := Node3D.new()
	temple.position = Vector3(-1.0, 0.0, -8.0)
	add_child(temple)
	for i in range(3):
		var step := MeshInstance3D.new()
		var mesh := BoxMesh.new()
		mesh.size = Vector3(5.2 - i * 0.35, 0.22, 3.8 - i * 0.25)
		step.mesh = mesh
		step.position.y = 0.1 + i * 0.22
		step.material_override = _material("d9d0b2")
		temple.add_child(step)
	for x in [-2.0, 2.0]:
		for z in [-1.1, 1.1]:
			var column := MeshInstance3D.new()
			var mesh := CylinderMesh.new()
			mesh.top_radius = 0.22
			mesh.bottom_radius = 0.28
			mesh.height = 2.7
			column.mesh = mesh
			column.position = Vector3(x, 1.65, z)
			column.material_override = _material("e4dcc3")
			temple.add_child(column)
	var roof := MeshInstance3D.new()
	var roof_mesh := PrismMesh.new()
	roof_mesh.size = Vector3(5.2, 1.2, 3.0)
	roof.mesh = roof_mesh
	roof.position.y = 3.2
	roof.material_override = _material("477c94")
	temple.add_child(roof)
	var crystal := MeshInstance3D.new()
	var crystal_mesh := SphereMesh.new()
	crystal_mesh.radial_segments = 8
	crystal_mesh.rings = 4
	crystal.mesh = crystal_mesh
	crystal.position = Vector3(0.0, 1.5, 0.0)
	crystal.scale = Vector3(0.65, 1.1, 0.65)
	crystal.material_override = _material("78c8dc", true)
	temple.add_child(crystal)


func _add_tree(position: Vector3, scale: float) -> void:
	var scene := load("res://assets/tree.glb") as PackedScene
	if scene == null:
		return
	var tree := scene.instantiate() as Node3D
	tree.position = position
	tree.scale = Vector3.ONE * scale
	add_child(tree)
	var trunk := StaticBody3D.new()
	trunk.position = position + Vector3(0.0, 0.8, 0.0)
	var shape_node := CollisionShape3D.new()
	var shape := CylinderShape3D.new()
	shape.radius = 0.38 * scale
	shape.height = 1.8 * scale
	shape_node.shape = shape
	trunk.add_child(shape_node)
	add_child(trunk)


func _material(color: String, glow := false) -> StandardMaterial3D:
	var material := StandardMaterial3D.new()
	material.albedo_color = Color(color)
	material.roughness = 0.9
	if glow:
		material.emission_enabled = true
		material.emission = Color(color)
		material.emission_energy_multiplier = 0.55
	return material
