// 11.29.25 Ver.2

1. Overall
	- Wave System Added: A complete 60-second wave cycle was implemented, including a countdown, wave announcement (“3, 2, 1 → WAVE 1”), and timed enemy phases.
	- Day/Night Cycle Added: The environment smoothly transitions from morning → daytime → sunset → night. Shadows, light intensity, and sky color change in real-time.
	- Boss Phase Implemented: At the end of each 60-second cycle, the world locks into night mode and a powerful boss spawns.
	- Improved UI/UX: Added money counter, tower selection panel, wave panel, boss HP bar, and tower placement preview.
	- Enhanced Visual Effects: Unified darker UI theme, grid transparency, improved HP bars, coin pop-up animation, tower destruction debris, and sniper laser visuals.

2. Tower System
	- New Tower Types Implemented
		: Basic Tower – Standard 1-damage single shot.
		: Double Tower – Shoots 2 bullets simultaneously, each dealing 1 damage (2 total damage per burst).
		: Sniper Tower – Long-range instant laser attack that deals 10 damage.
		: Tower4 Prototype – Placeholder for future content.
	- Complete Tower Models
		: Basic - Single cube
		: Double - Large cube + small cube stacked
		: Sniper - Tall black pillar
	- Tower HP & Destruction System Added
		: All non-core towers have HP + dynamic color HP bar.
		: When destroyed, towers break into animated debris pieces and disappear.
	- Tower Placement Preview Added
		: Ghost (transparent) mesh before placing.
		: Disabled when player has insufficient coins or tries placing in forbidden areas.
	- Tower Collision with Enemies Added
		: If an enemy hits a tower:
			a. Tower is destroyed immediately.
			b. Enemy loses HP equal to tower’s remaining HP.
			c. Enemy dies only if its HP becomes 0 or less.
		: Introduces tactical “tower sacrifice” mechanics.

3. Enemy System
	- Progressive Difficulty
		: Spawn intervals gradually decrease over time.
		: Enemy spawn speed automatically increases as the wave progresses.
	- Mini-Boss Added
		: Stronger, slower, high-HP variant of regular enemies appearing mid-wave.
	- Wave Boss Added
		: Huge enemy with high HP spawning every 60 seconds.
		: Comes with a dedicated Boss Health Bar.
	- Enemy–Tower Collision Behavior
		: Enemies now deal damage to towers on collision.
		: Partial HP reduction if the enemy survives the collision.

4. Reward & Economy System
	- Coin Drops Implemented
		: Enemies drop coins upon death.
		: Coins automatically added with a floating “+X” animation.
	- Tower Costs Enabled
		: Basic Tower: 5 coins
		: Double Tower: 10 coins
		: Sniper Tower: 20 coins
		: Tower4: 5 coins
	- UI Money Counter Added
		: Displays current coin amount.
		: Prevents building if insufficient funds.



------------------------------------------------------------------------------------------------------------------------------

// 11.12.25 Ver.1
1. Overall
- Improve Visuals – Enhance graphics with better textures, lighting effects, shadows, and possibly particle effects for bullets and explosions to make the game visually more appealing.
- Add More UI Elements – Introduce new interface components such as a money counter, wave indicator, upgrade buttons, and tower placement preview for better user experience.

2. Tower System
- Add More Tower Types and Functions – Implement various tower types with different attack styles (e.g., splash damage, slow effect, laser beam, long-range sniper).
- Add Placement Cost System – Each tower requires in-game currency to build, introducing a strategy element where the player must manage resources.
3. Enemy System
- Increase Spawn Difficulty Over Time – Gradually reduce spawn intervals or spawn multiple enemies simultaneously as time progresses to increase game challenge.
- Add Reward System for Kills – Award the player with money each time an enemy is destroyed, which can be used to build or upgrade towers.
