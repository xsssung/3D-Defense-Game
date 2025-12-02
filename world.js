// world.js
import * as THREE from 'three';

const FIELD_SIZE = 400;
const GRID_SIZE  = 2;
const SKY_RADIUS = 600; // Radius of the sky dome

export class World {
	constructor(scene) {
		this.scene = scene;  // Reference to main Three.js scene
		this.core  = null;   // Central base (target for enemies)

		// Lights / sky / sun
		this.dirLight     = null;
		this.ambientLight = null;
		this.skyDome      = null;
		this.sunMesh      = null;

		// Ground (used for biome switching)
		this.ground       = null;
		this.currentBiome = 'grass';
	}

	// --------------------------------------------------------
	// Ground + grid
	// --------------------------------------------------------
	createField() {
		const planeGeo = new THREE.PlaneGeometry(FIELD_SIZE, FIELD_SIZE);

		// Load pixel-style grass texture
		const loader = new THREE.TextureLoader();
		const tex = loader.load('textures/grass_pixel.jpg'); // <-- put your file here

		// Repeat texture across the field
		tex.wrapS = THREE.RepeatWrapping;
		tex.wrapT = THREE.RepeatWrapping;
		tex.repeat.set(40, 40);

		// Keep pixel-art look sharp
		tex.magFilter = THREE.NearestFilter;
		tex.minFilter = THREE.NearestFilter;

		// Ground material using the pixel grass texture
		const planeMat = new THREE.MeshStandardMaterial({
			map: tex,
			roughness: 1.0,
			metalness: 0.0,
			color: 0xffffff // neutral tint; biome will override this
		});

		const ground = new THREE.Mesh(planeGeo, planeMat);
		ground.rotation.x = -Math.PI / 2; // Lay flat on XZ plane
		ground.receiveShadow = true;
		this.scene.add(ground);

		// Store reference for biome changes
		this.ground = ground;

		// Optional subtle grid overlay (for tower placement)
		const divisions = FIELD_SIZE / GRID_SIZE;
		const grid = new THREE.GridHelper(
			FIELD_SIZE,
			divisions,
			0xaaaaaa,
			0xaaaaaa
		);
		grid.position.set(GRID_SIZE / 2, 0.01, GRID_SIZE / 2);

		// Make grid very faint
		if (Array.isArray(grid.material)) {
			grid.material.forEach((m) => {
				m.transparent = true;
				m.opacity = 0.02;
			});
		} else {
			grid.material.transparent = true;
			grid.material.opacity = 0.02;
		}

		this.scene.add(grid);
	}

	// --------------------------------------------------------
	// Core (player base)
	// --------------------------------------------------------
	createCore() {
		const loader = new THREE.TextureLoader();

		const coreTex = loader.load("textures/Old_Red_Brick_DIFF.png");
		coreTex.wrapS = THREE.RepeatWrapping;
		coreTex.wrapT = THREE.RepeatWrapping;
		coreTex.repeat.set(0.2,0.2);

		const coreGeo = new THREE.BoxGeometry(2, 4, 2);
		const coreMat = new THREE.MeshStandardMaterial({
			map: coreTex,
			metalness: 0.5,
			roughness: 0.2,
			emissive: 0x111122,
			emissiveIntensity: 0.3,
		});

		this.core = new THREE.Mesh(coreGeo, coreMat);
		this.core.position.set(0, 2, 0);
		this.core.castShadow = true;
		this.core.receiveShadow = true;
		this.scene.add(this.core);
	}

	// --------------------------------------------------------
	// Sky dome + visible sun disc
	// --------------------------------------------------------
	createSkyDome() {
		// Inverted sphere as the sky background
		const geo = new THREE.SphereGeometry(SKY_RADIUS, 32, 32);
		geo.scale(-1, 1, 1); // View from inside the sphere

		const mat = new THREE.MeshBasicMaterial({
			color: 0x87ceeb,     // Daytime blue
			side: THREE.BackSide,
			depthWrite: false
		});

		this.skyDome = new THREE.Mesh(geo, mat);
		this.scene.add(this.skyDome);

		// Initial background & fog
		const skyColor = new THREE.Color(0x87ceeb);
		this.scene.background = skyColor;
		this.scene.fog = new THREE.Fog(skyColor, 80, 400);

		// Visible sun disc (separate mesh on top of the sky)
		const sunGeo = new THREE.SphereGeometry(15, 32, 32);
		const sunMat = new THREE.MeshBasicMaterial({
			color: 0xfff3c0
		});
		sunMat.fog = false; // Sun should not be tinted by fog

		const sun = new THREE.Mesh(sunGeo, sunMat);
		sun.renderOrder = 1; // Render sun above sky dome
		this.scene.add(sun);
		this.sunMesh = sun;
	}

	// --------------------------------------------------------
	// Lights (directional sun + ambient)
	// --------------------------------------------------------
	createLights() {
		// Directional light used as the sun (casts shadows)
		const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
		dirLight.position.set(100, 150, -80);
		dirLight.castShadow = true;

		// Shadow settings
		dirLight.shadow.mapSize.set(2048, 2048);
		dirLight.shadow.camera.near = 10;
		dirLight.shadow.camera.far = 500;
		dirLight.shadow.camera.left = -200;
		dirLight.shadow.camera.right = 200;
		dirLight.shadow.camera.top = 200;
		dirLight.shadow.camera.bottom = -200;

		this.scene.add(dirLight);

		// Ambient light for base illumination
		const ambient = new THREE.AmbientLight(0xffffff, 0.3);
		this.scene.add(ambient);

		// Keep references for day/night updates
		this.dirLight = dirLight;
		this.ambientLight = ambient;
	}

	// --------------------------------------------------------
	// Biome control (grass / desert / snow)
	// --------------------------------------------------------
	// biome: 'grass', 'desert', 'snow'
	setBiome(biome) {
		this.currentBiome = biome;
		if (!this.ground) return;

		const mat = this.ground.material;

		// Color tints multiply the base texture
		if (biome === 'grass') {
			mat.color.set(0xffffff);      // Neutral (original green)
		} else if (biome === 'desert') {
			mat.color.set(0xf2e0a0);      // Warm sand tint
		} else if (biome === 'snow') {
			mat.color.set(0xf5f7ff);      // Cold, bright tint
		}

		mat.needsUpdate = true;
	}

	// Choose biome given a wave index:
	// 1 -> grass, 2 -> desert, 3 -> snow, 4 -> grass, ...
	setBiomeForWave(waveIndex) {
		const i = (waveIndex - 1) % 3;
		if (i === 0)      this.setBiome('grass');
		else if (i === 1) this.setBiome('desert');
		else              this.setBiome('snow');
	}

	// --------------------------------------------------------
	// Day / Night cycle
	// --------------------------------------------------------

	// globalTime: elapsed seconds since game start
	// freezeAtNight: if true and time >= cycle length, lock world at night (boss phase)
	updateDayNight(globalTime, freezeAtNight) {
		if (!this.dirLight || !this.ambientLight || !this.skyDome || !this.sunMesh) {
			return;
		}

		const cycleLength = 60; // seconds for one wave
		let t;

		// We will NOT use the full 0..1 cycle anymore.
		// Instead:
		//  - During normal play (no freezeAtNight), map time to [0.3, 0.7]
		//    => always morning → day → sunset, never deep night.
		//  - When freezeAtNight is true and time >= cycleLength, lock near full night.
		if (freezeAtNight && globalTime >= cycleLength) {
			// Boss phase: keep the world very dark
			t = 0.95;
		} else {
			const base = Math.min(globalTime / cycleLength, 1); // 0..1 over one wave
			// Map 0..1 -> [0.3, 0.7] (sun is always above horizon)
			t = 0.3 + base * 0.4;
		}

		// Smooth step for softer transitions
		const smooth = (x) => x * x * (3 - 2 * x);
		t = smooth(t);

		// Convert t to sun direction
		// Angle around the sky (0..2π, shifted so t=0.25 ~ noon-ish)
		const angle = t * Math.PI * 2 - Math.PI / 2;
		const azimuth = THREE.MathUtils.degToRad(120); // horizontal rotation

		const sunDir = new THREE.Vector3(
			Math.cos(angle) * Math.cos(azimuth),
			Math.sin(angle),
			Math.cos(angle) * Math.sin(azimuth)
		).normalize();

		const elevation = sunDir.y;

		// Light intensities based on elevation
		const sunIntensity = THREE.MathUtils.clamp(elevation * 1.5, 0.25, 1.2);
		const ambientIntensity = THREE.MathUtils.clamp(0.3 + elevation * 0.6, 0.2, 0.8);

		// Base colors
		const daySky   = new THREE.Color(0x87ceeb); // bright blue
		const nightSky = new THREE.Color(0x020309); // dark blue/black
		const duskSky  = new THREE.Color(0xff8c42); // orange

		const daySun   = new THREE.Color(0xfff9c4);
		const duskSun  = new THREE.Color(0xffc15c);
		const nightSun = new THREE.Color(0x555577);

		// Blend sky color based on elevation
		let skyColor = new THREE.Color();
		if (elevation > 0.2) {
			// Daytime: blend between dusk and day
			const f = THREE.MathUtils.clamp((elevation - 0.2) / 0.8, 0, 1);
			skyColor.lerpColors(duskSky, daySky, f);
		} else if (elevation > -0.2) {
			// Sunrise / sunset
			const f = THREE.MathUtils.clamp((elevation + 0.2) / 0.4, 0, 1);
			skyColor.lerpColors(nightSky, duskSky, f);
		} else {
			// Deep night (only reachable when freezeAtNight is true)
			skyColor.copy(nightSky);
		}

		// Blend sun color
		let sunColor = new THREE.Color();
		if (elevation > 0.2) {
			const f = THREE.MathUtils.clamp((elevation - 0.2) / 0.8, 0, 1);
			sunColor.lerpColors(duskSun, daySun, f);
		} else if (elevation > -0.2) {
			const f = THREE.MathUtils.clamp((elevation + 0.2) / 0.4, 0, 1);
			sunColor.lerpColors(nightSun, duskSun, f);
		} else {
			sunColor.copy(nightSun);
		}

		// Position directional light (used for shadows)
		const lightDistance = 200;
		const lightPos = sunDir.clone().multiplyScalar(lightDistance);
		this.dirLight.position.copy(lightPos);
		this.dirLight.target.position.set(0, 0, 0);
		this.dirLight.target.updateMatrixWorld();

		this.dirLight.intensity = sunIntensity;
		this.dirLight.color.copy(sunColor);
		this.ambientLight.intensity = ambientIntensity;

		// Position visible sun mesh on the sky dome
		const sunDistance = SKY_RADIUS - 20;
		const sunPos = sunDir.clone().multiplyScalar(sunDistance);
		this.sunMesh.position.copy(sunPos);

		// Hide sun only when it is really under the horizon
		this.sunMesh.visible = (elevation > -0.05);
		this.sunMesh.material.color.copy(sunColor);

		// Update sky dome material, scene background and fog
		if (this.skyDome && this.skyDome.material) {
			this.skyDome.material.color.copy(skyColor);
		}
		this.scene.background = skyColor;
		if (this.scene.fog) {
			this.scene.fog.color.copy(skyColor);
		}
	}


	// --------------------------------------------------------
	// Initialize all world elements
	// --------------------------------------------------------
	init() {
		this.createField();   // Ground + grid
		this.createCore();    // Central base
		this.createSkyDome(); // Sky dome + sun
		this.createLights();  // Directional + ambient lights
	}
}
