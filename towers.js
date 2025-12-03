// towers.js
import * as THREE from 'three';
import { textureLoad, TextureLoader } from 'three/tsl';

const GRID_SIZE = 2;
const BLOCK_SIZE = 1.8;
const textureLoader = new THREE.TextureLoader();

const towerTex = textureLoader.load("textures/Rock_Wall_DIFF.png");
towerTex.wrapS = THREE.RepeatWrapping;
towerTex.wrapT = THREE.RepeatWrapping;
towerTex.repeat.set(0.2,0.2);

const towerTexDamaged = textureLoader.load("textures/Rock_Wall_Damaged_DIFF.png");
towerTexDamaged.wrapS = THREE.RepeatWrapping;
towerTexDamaged.wrapT = THREE.RepeatWrapping;
towerTexDamaged.repeat.set(0.2,0.2);

export class Tower {
	constructor(scene, position, type = 'basic', onEnemyKilled = null, existingMesh = null) {
		this.scene = scene;                      // Reference to the main scene
		this.position = position.clone();        // Tower placement position
		this.type = type;                        // "core", "basic", "double", "sniper", "cannon"
		this.lastShot = 0;                       // Timestamp of last fired bullet
		this.bullets = [];                       // Active bullets
		this.onEnemyKilled = onEnemyKilled;      // Callback when an enemy is killed

		// Fire rate, range, and HP per tower type
		if (type === 'core') {
			this.fireRate = 2400;
			this.shotsPerBurst = 1;
			this.range = 15;
			this.maxHp = 9999;

		} else if (type === 'double') {
			// "Double" tower: 2 bullets per burst → up to 2 damage
			this.fireRate = 1200;
			this.shotsPerBurst = 2;
			this.range = 15;
			this.maxHp = 5;

		} else if (type === 'sniper') {
			// Sniper tower: slow rate, huge range, big damage
			this.fireRate = 4800;      // very slow fire rate
			this.shotsPerBurst = 1;
			this.range = 50;
			this.maxHp = 5;

		} else if (type === 'cannon') {
			this.fireRate = 2400;
			this.shotsPerBurst = 1;
			this.range = 10;
			this.maxHp = 5;

		} else {
			// Basic tower
			this.fireRate = 1200;
			this.shotsPerBurst = 1;
			this.range = 15;
			this.maxHp = 5;
		}

		// HP always starts full when a tower is placed
		this.hp = this.maxHp;
		this.isDestroyed = false;

		// Debris pieces after tower is destroyed
		this.debris = [];

		// -----------------------------
		// Tower visual (mesh / group)
		// -----------------------------
		let towerTopHeight; // vertical position of the tower's top (used for HP bar)

		if (existingMesh) {
			// Use existing mesh (e.g., main core from world.js)
			this.mesh = existingMesh;
			// In world.js core height is 4 → top at y = 4
			towerTopHeight = 4;

		} else if (type === 'basic') {
			// BASIC: single cube
			const size = BLOCK_SIZE;
			const geo = new THREE.BoxGeometry(size, size, size);
			const mat = new THREE.MeshStandardMaterial({ map: towerTex, color: 0xf1c40f }); // yellow
			const mesh = new THREE.Mesh(geo, mat);

			mesh.position.copy(this.position);
			mesh.position.y = size / 2;  // center = height/2

			this.scene.add(mesh);
			this.mesh = mesh;

			// top of tower = size
			towerTopHeight = size;

		} else if (type === 'double') {
			// DOUBLE: big cube + small cube stacked on top
			const baseSize = BLOCK_SIZE;
			const topSize  = BLOCK_SIZE * 0.6;

			const group = new THREE.Group();

			// Bottom cube
			const baseGeo = new THREE.BoxGeometry(baseSize, baseSize, baseSize);
			const baseMat = new THREE.MeshStandardMaterial({ map: towerTex, color: 0x00cec9 });
			const baseMesh = new THREE.Mesh(baseGeo, baseMat);
			baseMesh.position.set(0, baseSize / 2, 0);

			// Top cube (smaller)
			const topGeo = new THREE.BoxGeometry(topSize, topSize, topSize);
			const topMat = new THREE.MeshStandardMaterial({ map: towerTex, color: 0x00cec9 });
			const topMesh = new THREE.Mesh(topGeo, topMat);
			topMesh.position.set(0, baseSize + topSize / 2, 0);

			group.add(baseMesh);
			group.add(topMesh);

			group.position.copy(this.position);

			this.scene.add(group);
			this.mesh = group;

			// top of tower = baseSize + topSize
			towerTopHeight = baseSize + topSize;

			baseMesh.castShadow = baseMesh.receiveShadow = true;
			topMesh.castShadow  = topMesh.receiveShadow  = true;

		} else if (type === 'sniper') {
			// SNIPER: tall black pillar (longer than core)
			const width  = BLOCK_SIZE * 0.8;
			const height = 6;                    // core is 4 → sniper taller
			const depth  = BLOCK_SIZE * 0.8;

			const geo = new THREE.BoxGeometry(width, height, depth);
			const mat = new THREE.MeshStandardMaterial({ map: towerTex, color: 0x000000 }); // black
			const mesh = new THREE.Mesh(geo, mat);

			mesh.position.copy(this.position);
			mesh.position.y = height / 2;

			this.scene.add(mesh);
			this.mesh = mesh;

			// top of tower = height
			towerTopHeight = height;

		} else {
			// Default: pillar-like tower (e.g., tower4)
			const height = 4;
			const geo = new THREE.BoxGeometry(BLOCK_SIZE, height, BLOCK_SIZE);
			const mat = new THREE.MeshStandardMaterial({ map: towerTex, color: 0xf1c40f });
			const mesh = new THREE.Mesh(geo, mat);

			mesh.position.copy(this.position);
			mesh.position.y = height / 2;

			this.scene.add(mesh);
			this.mesh = mesh;

			// top of tower = height
			towerTopHeight = height;
		}

		// Common shadow settings (for Mesh or Group)
		if (this.mesh) {
			this.mesh.castShadow = true;
			this.mesh.receiveShadow = true;
		}

		// Small HP bar above the tower (only for non-core towers)
		this.hpBar = null;
		if (this.type !== 'core') {
			this.createHpBar(towerTopHeight);
		}
	}

	// Called every frame - handles targeting, bullets, HP bar, and debris
	update(enemies, delta, camera) {
		const now = performance.now();

		// 1. Target & shoot only if tower is still alive
		if (!this.isDestroyed) {
			// Find the closest enemy within range
			let nearest = null;
			let minDist = this.range;
			for (const e of enemies) {
				const dist = this.mesh.position.distanceTo(e.position);
				if (dist < minDist) {
					minDist = dist;
					nearest = e;
				}
			}

			// Fire if cooldown passed
			if (nearest && now - this.lastShot > this.fireRate) {
				for (let i = 0; i < this.shotsPerBurst; i++) {
					this.shoot(nearest, i, this.shotsPerBurst);
				}
				this.lastShot = now;
			}

			// Update bullets only while tower is alive
			this.updateBullets(delta);
		}

		// 2. Update HP bar orientation and fill
		this.updateHpBar(camera);

		// 3. Update debris pieces after tower is destroyed
		this.updateDebris(delta);
	}

	// Create a small HP bar above the tower
	createHpBar(towerTopHeight) {
		const barWidth = 1.4;
		const barHeight = 0.15;

		// Place HP bar just above the top of the tower
		const yOffset = towerTopHeight + 0.5;

		// Background (black transparent)
		const bgGeo = new THREE.PlaneGeometry(barWidth, barHeight);
		const bgMat = new THREE.MeshBasicMaterial({
			color: 0x000000,
			transparent: true,
			opacity: 0.6,
			side: THREE.DoubleSide,
		});
		const bgMesh = new THREE.Mesh(bgGeo, bgMat);

		// Fill (green/yellow/red depending on HP)
		const fgGeo = new THREE.PlaneGeometry(barWidth, barHeight);
		const fgMat = new THREE.MeshBasicMaterial({
			color: 0x00e676,
			transparent: true,
			opacity: 0.9,
			side: THREE.DoubleSide,
		});
		const fgMesh = new THREE.Mesh(fgGeo, fgMat);

		// Group for easier control
		const group = new THREE.Group();
		group.add(bgMesh);
		group.add(fgMesh);

		// Position just above the tower
		group.position.set(0, yOffset, 0);

		this.mesh.add(group);

		this.hpBar = {
			group,
			bg: bgMesh,
			fg: fgMesh,
			maxWidth: barWidth,
		};
	}

	// Update HP bar scale and color
	updateHpBar(camera) {
		if (!this.hpBar) return;

		const ratio = Math.max(0, this.hp / this.maxHp);

		// Update bar length
		this.hpBar.fg.scale.set(ratio, 1, 1);
		this.hpBar.fg.position.x = (ratio - 1) * (this.hpBar.maxWidth / 2);

		// Color: green → yellow → red
		if (ratio > 0.5) {
			this.hpBar.fg.material.color.set(0x00e676);
		} else if (ratio > 0.25) {
			this.hpBar.fg.material.color.set(0xffeb3b);
		} else {
			this.hpBar.fg.material.color.set(0xf44336);
		}

		// Make the bar face the camera
		if (camera) {
			this.hpBar.group.lookAt(camera.position);
		}
	}

	// Update texture based on health 
	updateTex() {
		const ration = this.hp / this.maxHp;

		const newTex = (ratio <= 0.5) ? towerTexDamaged : towerTex;

		if (this.mesh instanceof THREE.Mesh) {
			this.mesh.material.map = newTex;
			this.mesh.material.needsUpdate = true;
			return;
		}

		if (this.mesh instanceof THREE.Group) {
			this.mesh.traverse(child => {
				if (child.isMesh && child.material) {
					child.material.map = newTex;
					child.material.needsUpdate = true;
				}
			});
		}
	}

	// Apply damage to this tower
	takeDamage(amount) {
		if (this.isDestroyed) return;

		this.hp = Math.max(0, this.hp - amount);

		if (this.hp <= 0) {
			this.hp = 0;
			this.isDestroyed = true;
			this.breakApart(); // Play break-apart effect
		}

		this.updateHpBar();
		this.updateTex();
	}

	// Called when tower HP reaches 0 - create break apart effect
	breakApart() {
		// Remove HP bar if exists
		if (this.hpBar && this.hpBar.group && this.hpBar.group.parent) {
			this.hpBar.group.parent.remove(this.hpBar.group);
		}
		this.hpBar = null;

		// Hide main tower mesh, but keep its position as debris origin
		if (this.mesh) {
			this.mesh.visible = false;
		}

		// Create debris pieces at tower position
		this.createDebris();
	}

	// Create small cube debris that scatter and fade out
	createDebris() {
		if (!this.mesh) return;

		const origin = this.mesh.position.clone();
		const debrisCount = 10;           // number of pieces
		const baseSize = BLOCK_SIZE * 0.3;

		for (let i = 0; i < debrisCount; i++) {
			const size = baseSize * (0.6 + Math.random() * 0.8);
			const geo = new THREE.BoxGeometry(size, size, size);

			let debrisColor;
			if (this.type === 'double') {
				debrisColor = 0x00cec9;
			} else if (this.type === 'core') {
				debrisColor = 0xe74c3c;
			} else if (this.type === 'sniper') {
				debrisColor = 0x000000;
			} else {
				// basic, tower4, etc.
				debrisColor = 0xf1c40f;
			}

			const mat = new THREE.MeshStandardMaterial({
				color: debrisColor,
				transparent: true,
				opacity: 1.0,
				metalness: 0.2,
				roughness: 0.7,
			});
			const piece = new THREE.Mesh(geo, mat);

			// Start near the tower position with slight random offset
			piece.position.set(
				origin.x + (Math.random() - 0.5) * 0.5,
				origin.y + Math.random() * 0.5,
				origin.z + (Math.random() - 0.5) * 0.5
			);

			// Random velocity (scatter)
			const velocity = new THREE.Vector3(
				(Math.random() - 0.5) * 5,
				2 + Math.random() * 3,
				(Math.random() - 0.5) * 5
			);

			// Random angular velocity
			const angularVel = new THREE.Vector3(
				(Math.random() - 0.5) * 4,
				(Math.random() - 0.5) * 4,
				(Math.random() - 0.5) * 4
			);

			// Life time in seconds
			const life = 1.2 + Math.random() * 0.5;

			this.scene.add(piece);

			this.debris.push({
				mesh: piece,
				velocity,
				angularVel,
				life,
				age: 0,
			});
		}
	}

	// Update debris pieces: fall with gravity, fade out, then remove
	updateDebris(delta) {
		if (!this.debris || this.debris.length === 0) return;

		const GRAVITY = -9.8;
		const remaining = [];

		for (const d of this.debris) {
			d.age += delta;
			if (d.age > d.life) {
				// Lifetime over - remove from scene
				if (d.mesh && d.mesh.parent) {
					d.mesh.parent.remove(d.mesh);
				}
				continue;
			}

			// Apply gravity and move
			d.velocity.y += GRAVITY * delta * 0.5;
			d.mesh.position.addScaledVector(d.velocity, delta);

			// Rotate piece
			d.mesh.rotation.x += d.angularVel.x * delta;
			d.mesh.rotation.y += d.angularVel.y * delta;
			d.mesh.rotation.z += d.angularVel.z * delta;

			// Fade out opacity over lifetime
			const t = d.age / d.life; // 0 → 1
			const opacity = 1.0 - t;
			if (d.mesh.material && d.mesh.material.transparent) {
				d.mesh.material.opacity = opacity;
			}

			remaining.push(d);
		}

		this.debris = remaining;
	}

	// Shoot a bullet toward a specific target
	shoot(target, index = 0, total = 1) {

		// === SNIPER LASER MODE ===
		if (this.type === 'sniper') {

			// Start & end positions
			const startPos = this.mesh.position.clone();
			const endPos = target.position.clone();

			// Laser geometry (line)
			const points = [startPos, endPos];
			const laserGeo = new THREE.BufferGeometry().setFromPoints(points);

			// Red laser material
			const laserMat = new THREE.LineBasicMaterial({
				color: 0xff0000,
				linewidth: 4, // (WebGL often ignores this, but keep for intent)
			});

			const laser = new THREE.Line(laserGeo, laserMat);
			this.scene.add(laser);

			// Deal damage instantly
			if (this.onEnemyKilled && target.userData) {
				target.userData.hp -= 10;
				if (target.userData.hp <= 0) {
					this.onEnemyKilled(target);
				}
			}

			// Remove laser after short flash
			setTimeout(() => {
				this.scene.remove(laser);
			}, 120); // 0.12 seconds flash

			return; // skip normal bullet logic
		}

		// === NON-SNIPER (normal bullets) ===

		const bulletGeo = new THREE.SphereGeometry(0.2, 8, 8);
		const bulletMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
		const bullet = new THREE.Mesh(bulletGeo, bulletMat);

		const startPos = this.mesh.position.clone();

		// Spread bullets for multi-shot towers (e.g., double)
		if (total > 1) {
			const toTarget = new THREE.Vector3().subVectors(target.position, startPos);
			toTarget.y = 0;
			if (toTarget.lengthSq() > 0) {
				toTarget.normalize();
				const up = new THREE.Vector3(0, 1, 0);
				const side = new THREE.Vector3().crossVectors(toTarget, up).normalize();
				const spacing = 0.8;
				const offsetFromCenter = (index - (total - 1) / 2) * spacing;

				startPos.addScaledVector(side, offsetFromCenter);
			}
		}

		bullet.position.copy(startPos);

		bullet.userData = {
			target,
			speed: 20,
		};

		this.scene.add(bullet);
		this.bullets.push(bullet);
	}

	// Move bullets and detect hits with enemies
	updateBullets(delta) {
		const active = [];

		for (const b of this.bullets) {
			const target = b.userData.target;

			// If the target no longer exists, remove the bullet
			if (!target) {
				this.scene.remove(b);
				continue;
			}

			// If the target is already marked dead, remove the bullet
			if (target.userData && target.userData.isDead) {
				this.scene.remove(b);
				continue;
			}

			// Calculate direction from bullet → target
			const dir = new THREE.Vector3().subVectors(target.position, b.position);
			const dist = dir.length();

			// Collision check: if close enough, treat it as a hit
			if (dist < 0.5) {
				this.scene.remove(b);

				if (this.onEnemyKilled && target.userData) {
					// Sniper damage (backup in case a bullet somehow exists)
					if (this.type === 'sniper') {
						target.userData.hp -= 10;
						if (target.userData.hp <= 0) {
							this.onEnemyKilled(target);
						}

					// Double: 2 bullets per burst → 1 damage each hit
					} else if (this.type === 'double') {
						target.userData.hp -= 1;
						if (target.userData.hp <= 0) {
							this.onEnemyKilled(target);
						}
					//cannon damage
					} else if (this.type === 'cannon') {
						target.userData.hp -= 15;
						if(target.userData.hp <= 0) {
							this.onEnemyKilled(target);
						}	
					// Basic / others: 1 damage per hit
					} else {
						target.userData.hp -= 1;
						if (target.userData.hp <= 0) {
							this.onEnemyKilled(target);
						}
					}
				}
				continue;
			}

			// Move bullet toward target
			dir.normalize();
			b.position.addScaledVector(dir, b.userData.speed * delta);

			// Keep the bullet active
			active.push(b);
		}

		// Update list with active bullets only
		this.bullets = active;
	}
}
