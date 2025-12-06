// world.js
import * as THREE from 'three';

const FIELD_SIZE = 400;
const GRID_SIZE  = 2;
const SKY_RADIUS = 600; // Radius of the sky dome

const loader = new THREE.TextureLoader();

const coreTex = loader.load("textures/Old_Red_Brick_DIFF.png");
coreTex.wrapS = THREE.RepeatWrapping;
coreTex.wrapT = THREE.RepeatWrapping;
coreTex.repeat.set(1,1);

const coreTexSmallDamage = loader.load("textures/Old_Red_Brick_Small_Cracks_DIFF.png");
coreTexSmallDamage.wrapS = THREE.RepeatWrapping;
coreTexSmallDamage.wrapT = THREE.RepeatWrapping;
coreTexSmallDamage.repeat.set(1,1);

const coreTexLargeDamage = loader.load("textures/Old_Red_Brick_Large_Cracks_DIFF.png");
coreTexLargeDamage.wrapS = THREE.RepeatWrapping;
coreTexLargeDamage.wrapT = THREE.RepeatWrapping;
coreTexLargeDamage.repeat.set(1,1);

const coreTexReallyLargeDamage = loader.load("textures/Old_Red_Brick_Really_Large_Cracks_DIFF.png");
coreTexReallyLargeDamage.wrapS = THREE.RepeatWrapping;
coreTexReallyLargeDamage.wrapT = THREE.RepeatWrapping;
coreTexReallyLargeDamage.repeat.set(1,1);

const grass_tex = loader.load('textures/grass_pixel.jpg');
// Repeat texture across the field
grass_tex.wrapS = THREE.RepeatWrapping;
grass_tex.wrapT = THREE.RepeatWrapping;
grass_tex.repeat.set(40, 40);

// Keep pixel-art look sharp
grass_tex.magFilter = THREE.NearestFilter;
grass_tex.minFilter = THREE.NearestFilter;

const snow_tex = loader.load('textures/snow_pixel.jpg');
snow_tex.wrapS = THREE.RepeatWrapping;
snow_tex.wrapT = THREE.RepeatWrapping;
snow_tex.repeat.set(40, 40);

// Keep pixel-art look sharp
snow_tex.magFilter = THREE.NearestFilter;
snow_tex.minFilter = THREE.NearestFilter;

const sand_tex = loader.load('textures/sand_pixel.jpg');
sand_tex.wrapS = THREE.RepeatWrapping;
sand_tex.wrapT = THREE.RepeatWrapping;
sand_tex.repeat.set(40, 40);

// Keep pixel-art look sharp
sand_tex.magFilter = THREE.NearestFilter;
sand_tex.minFilter = THREE.NearestFilter;

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

		// Add references to preloaded textures
		this.textures = {
			grass: grass_tex,
			sand: sand_tex,
			snow: snow_tex
		};

		this.snowParticles = null;
		this.sandParticles = null;
	}

	// --------------------------------------------------------
	// Ground + grid
	// --------------------------------------------------------
	createField() {
		const planeGeo = new THREE.PlaneGeometry(FIELD_SIZE, FIELD_SIZE);

		// Ground material using the pixel grass texture
		const planeMat = new THREE.MeshStandardMaterial({
			map: this.textures.grass,
			roughness: 1.0,
			metalness: 0.0,
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

	//---------------------------------------------------------
	// Create SNOW particle system
	//---------------------------------------------------------
	createSnow() {
		if (this.snowParticles) return; // already exists

		const count = 5000;
		const geo = new THREE.BufferGeometry();
		const positions = new Float32Array(count * 3);

		for (let i = 0; i < count; i++) {
			positions[i*3 + 0] = (Math.random() - 0.5) * FIELD_SIZE;
			positions[i*3 + 1] = Math.random() * 80 + 20;  // Height
			positions[i*3 + 2] = (Math.random() - 0.5) * FIELD_SIZE;
		}

		geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));

		const mat = new THREE.PointsMaterial({
			color: 0xffffff,
			size: 0.4,
			transparent: true,
			opacity: 0.85,
			sizeAttenuation: true
		});

		this.snowParticles = new THREE.Points(geo, mat);
		this.scene.add(this.snowParticles);
	}

	//---------------------------------------------------------
	// Create SAND particle system
	//---------------------------------------------------------
	createSand() {
		if (this.sandParticles) return;

		const count = 4000;
		const geo = new THREE.BufferGeometry();
		const positions = new Float32Array(count * 3);

		for (let i = 0; i < count; i++) {
			positions[i*3 + 0] = (Math.random() - 0.5) * FIELD_SIZE;
			positions[i*3 + 1] = Math.random() * 20 + 2; // lower height = blowing dust
			positions[i*3 + 2] = (Math.random() - 0.5) * FIELD_SIZE;
		}

		geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));

		const mat = new THREE.PointsMaterial({
			color: 0xdeb887,  // sandy tan color
			size: 0.25,
			transparent: true,
			opacity: 0.7,
			sizeAttenuation: true
		});

		this.sandParticles = new THREE.Points(geo, mat);
		this.scene.add(this.sandParticles);
	}

	//---------------------------------------------------------
	// Remove particles when switching biomes
	//---------------------------------------------------------
	removeSnow() {
		if (!this.snowParticles) return;
		this.scene.remove(this.snowParticles);
		this.snowParticles.geometry.dispose();
		this.snowParticles.material.dispose();
		this.snowParticles = null;
	}

	removeSand() {
		if (!this.sandParticles) return;
		this.scene.remove(this.sandParticles);
		this.sandParticles.geometry.dispose();
		this.sandParticles.material.dispose();
		this.sandParticles = null;
	}


	// --------------------------------------------------------
	// Biome control (grass / desert / snow)
	// --------------------------------------------------------
	// biome: 'grass', 'desert', 'snow'
	setBiome(biome) {
		this.currentBiome = biome;
		if (!this.ground) return;

		const mat = this.ground.material;
		
		this.removeSand();
		this.removeSnow();

		// Color tints multiply the base texture
		if (biome === 'grass') {
			mat.map = this.textures.grass;  
		} else if (biome === 'desert') {
			mat.map = this.textures.sand; 
			this.createSand();     
		} else if (biome === 'snow') {
			mat.map = this.textures.snow; 
			this.createSnow();
		}

		mat.needsUpdate = true;
	}

	//----------------------------------------------------------
	// update sand and snow particles
	//-----------------------------------------------------------

	updateParticles(deltaTime) {
		// Snow falls downward
		if (this.snowParticles) {
			const pos = this.snowParticles.geometry.attributes.position.array;
			for (let i = 0; i < pos.length; i += 3) {
				pos[i + 1] -= 8 * deltaTime; // fall speed

				// Respawn at top
				if (pos[i + 1] < 0) {
					pos[i + 1] = 80;
				}
			}
			this.snowParticles.geometry.attributes.position.needsUpdate = true;
		}

		// Sand blows sideways
		if (this.sandParticles) {
			const pos = this.sandParticles.geometry.attributes.position.array;
			for (let i = 0; i < pos.length; i += 3) {
				pos[i + 0] += 14 * deltaTime; // wind direction x+

				// wrap around world
				if (pos[i + 0] > FIELD_SIZE / 2) {
					pos[i + 0] = -FIELD_SIZE / 2;
				}
			}
			this.sandParticles.geometry.attributes.position.needsUpdate = true;
		}
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

	//update core texture based on damage
	updateCoreTex(coreHealth) {
		if (!this.core) return;

		if (coreHealth <= 5) {
			this.core.material.map = coreTexReallyLargeDamage;
		} else if (coreHealth <= 10) {
			this.core.material.map = coreTexLargeDamage;
		} else if (coreHealth <= 15) {
			this.core.material.map = coreTexSmallDamage;
		} else {
			this.core.material.map = coreTex;
		}

		this.core.material.needsUpdate = true;
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
