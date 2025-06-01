class PongGame {
    constructor() {
        this.canvas = document.getElementById('game-canvas');
        this.ctx = this.canvas.getContext('2d');

        // UI Elements
        this.startMessage = document.getElementById('start-message');
        this.pauseMessage = document.getElementById('pause-message');
        this.gameOverMessage = document.getElementById('game-over');
        this.winnerText = document.getElementById('winner-text');
        this.player1ScoreEl = document.getElementById('player1-score');
        this.player2ScoreEl = document.getElementById('player2-score');
        this.pauseBtn = document.getElementById('pause-btn');
        this.resetBtn = document.getElementById('reset-btn');
        this.fullscreenBtn = document.getElementById('fullscreen-btn');

        // Game state
        this.gameState = 'start'; // 'start', 'playing', 'paused', 'gameOver'
        this.animationId = null;
        this.lastTime = 0;

        // Game settings
        this.targetFPS = 60;
        this.frameInterval = 1000 / this.targetFPS;
        this.maxScore = 3; // Best of 5: first to 3 points wins

        // Fixed game settings (medium difficulty)
        this.aiSpeed = 0.06;
        this.ballSpeedMultiplier = 1.0;
        this.speedIncrease = 1.05;

        // Particle system
        this.particles = [];
        this.maxParticles = 50;

        // Mobile detection and fullscreen state
        this.isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
            (navigator.maxTouchPoints && navigator.maxTouchPoints > 2);
        this.isFullscreen = false;
        this.gameContainer = null; // Will be set in setupCanvas

        // Sound effects
        this.sounds = {};
        this.initSounds();

        // Initialize game objects
        this.initializeGameObjects();

        // Setup canvas and event listeners
        this.setupCanvas();
        this.setupEventListeners();

        // Start render loop
        this.render();
    }

    initSounds() {
        // Create audio context for sound effects
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.soundEnabled = true;
        } catch (e) {
            this.soundEnabled = false;
            console.log('Audio not supported');
        }
    }

    playSound(frequency, duration = 0.1, type = 'sine', volume = 0.3) {
        if (!this.soundEnabled) return;

        try {
            const oscillator = this.audioContext.createOscillator();
            const gainNode = this.audioContext.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(this.audioContext.destination);

            oscillator.frequency.setValueAtTime(frequency, this.audioContext.currentTime);
            oscillator.type = type;

            gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
            gainNode.gain.linearRampToValueAtTime(volume, this.audioContext.currentTime + 0.01);
            gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + duration);

            oscillator.start(this.audioContext.currentTime);
            oscillator.stop(this.audioContext.currentTime + duration);
        } catch (e) {
            // Fallback silence
        }
    }

    initializeGameObjects() {
        // Ball
        this.ball = {
            x: 0,
            y: 0,
            radius: 10,
            speedX: 0,
            speedY: 0,
            maxSpeed: 12,
            baseSpeed: 5,
            trail: [],
            glowSize: 20
        };

        // Paddles
        this.paddle1 = {
            x: 20,
            y: 0,
            width: 15,
            height: 100,
            targetY: 0,
            glowSize: 15
        };

        this.paddle2 = {
            x: 0,
            y: 0,
            width: 15,
            height: 100,
            targetY: 0,
            currentY: 0,
            speed: 6,
            maxSpeed: 8,
            glowSize: 15,
            reactionDelay: 0,
            prediction: { x: 0, y: 0 },
            lastUpdate: 0
        };

        // Score
        this.score = {
            player1: 0,
            player2: 0
        };

        // Mouse position
        this.mouseY = 0;
        this.lastMouseY = 0;

        // Game effects
        this.screenShake = 0;
        this.speedMultiplier = 1; // This will accumulate throughout the game
        this.rallyCount = 0;
        this.totalHits = 0; // Track total hits in the game for cumulative speed
        this.ballScored = false; // Flag to prevent multiple scoring

        this.resetBall();
        this.resetPaddles();
    }

    setupCanvas() {
        // Store reference to game container for mobile fullscreen
        this.gameContainer = document.querySelector('.game-container');

        const resizeCanvas = () => {
            const container = this.canvas.parentElement;
            const rect = container.getBoundingClientRect();

            // Set canvas size to match container
            this.canvas.width = rect.width;
            this.canvas.height = rect.height;

            // Update game object positions based on new size
            this.resetPaddles();
            if (this.gameState === 'start') {
                this.resetBall();
            }
        };

        // Initial resize
        resizeCanvas();

        // Resize on window resize
        window.addEventListener('resize', resizeCanvas);

        // Resize observer for more responsive updates
        if (window.ResizeObserver) {
            const resizeObserver = new ResizeObserver(resizeCanvas);
            resizeObserver.observe(this.canvas.parentElement);
        }

        // Add orientation change handler for mobile
        if (this.isMobile) {
            window.addEventListener('orientationchange', () => {
                // Delay resize to allow orientation change to complete
                setTimeout(resizeCanvas, 200);
            });
        }
    }

    setupEventListeners() {
        // Mouse movement - Track on entire document for better control
        const updateMousePosition = (clientX, clientY) => {
            const rect = this.canvas.getBoundingClientRect();
            this.mouseY = clientY - rect.top;
            // Direct assignment for immediate response
            this.paddle1.targetY = this.mouseY - this.paddle1.height / 2;
        };

        // Mouse movement on document (works even outside canvas)
        document.addEventListener('mousemove', (e) => {
            updateMousePosition(e.clientX, e.clientY);
        });

        // Touch support for mobile
        this.canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            updateMousePosition(touch.clientX, touch.clientY);
        });

        // Click events for game control
        this.canvas.addEventListener('click', () => {
            this.handleGameClick();
        });

        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.handleGameClick();
        });

        this.startMessage.addEventListener('click', () => {
            this.handleGameClick();
        });

        this.pauseMessage.addEventListener('click', () => {
            this.handleGameClick();
        });

        this.gameOverMessage.addEventListener('click', () => {
            this.handleGameClick();
        });

        // Control buttons
        this.pauseBtn.addEventListener('click', () => {
            if (this.gameState === 'playing') {
                this.pauseGame();
            } else if (this.gameState === 'paused') {
                this.resumeGame();
            }
        });

        this.resetBtn.addEventListener('click', () => {
            this.resetGame();
        });

        // Fullscreen button
        this.fullscreenBtn.addEventListener('click', () => {
            this.toggleFullscreen();
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            switch (e.key) {
                case ' ':
                case 'Spacebar':
                    e.preventDefault();
                    this.handleGameClick();
                    break;
                case 'p':
                case 'P':
                    if (this.gameState === 'playing') {
                        this.pauseGame();
                    } else if (this.gameState === 'paused') {
                        this.resumeGame();
                    }
                    break;
                case 'r':
                case 'R':
                    this.resetGame();
                    break;
                case 'f':
                case 'F':
                    e.preventDefault();
                    this.toggleFullscreen();
                    break;
                case 'Escape':
                    // Exit fullscreen on Escape key
                    if (this.isMobile && this.isFullscreen) {
                        this.exitMobileFullscreen();
                    } else if (!this.isMobile && document.fullscreenElement) {
                        this.toggleFullscreen();
                    }
                    break;
            }
        });

        // Prevent context menu on canvas
        this.canvas.addEventListener('contextmenu', (e) => {
            e.preventDefault();
        });

        // Desktop fullscreen change events
        if (!this.isMobile) {
            document.addEventListener('fullscreenchange', () => {
                this.updateFullscreenButton();
            });
            document.addEventListener('webkitfullscreenchange', () => {
                this.updateFullscreenButton();
            });
            document.addEventListener('mozfullscreenchange', () => {
                this.updateFullscreenButton();
            });
            document.addEventListener('MSFullscreenChange', () => {
                this.updateFullscreenButton();
            });
        }
    }

    handleGameClick() {
        // Resume audio context on user interaction
        if (this.audioContext && this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }

        switch (this.gameState) {
            case 'start':
                this.startGame();
                break;
            case 'paused':
                this.resumeGame();
                break;
            case 'gameOver':
                this.resetGame();
                break;
        }
    }

    startGame() {
        this.gameState = 'playing';
        this.hideAllMessages();
        this.resetBall();
        this.lastTime = performance.now();
        this.playSound(800, 0.2, 'square', 0.4); // Start sound
    }

    pauseGame() {
        this.gameState = 'paused';
        this.showMessage('pause-message');
        this.pauseBtn.querySelector('.btn-text').textContent = 'Resume';
        this.playSound(400, 0.1, 'sine', 0.3); // Pause sound
    }

    resumeGame() {
        this.gameState = 'playing';
        this.hideAllMessages();
        this.pauseBtn.querySelector('.btn-text').textContent = 'Pause';
        this.lastTime = performance.now();
        this.playSound(600, 0.1, 'sine', 0.3); // Resume sound
    }

    resetGame() {
        this.gameState = 'start';
        this.score.player1 = 0;
        this.score.player2 = 0;
        this.speedMultiplier = 1; // Reset speed for new game
        this.rallyCount = 0;
        this.totalHits = 0; // Reset total hits for new game
        this.ballScored = false; // Reset scoring flag for new game
        this.updateScoreDisplay();
        this.resetBall();
        this.resetPaddles();
        this.showMessage('start-message');
        this.pauseBtn.querySelector('.btn-text').textContent = 'Pause';
        this.particles = [];
    }

    resetBall() {
        this.ball.x = this.canvas.width / 2;
        this.ball.y = this.canvas.height / 2;

        // Random direction
        const angle = (Math.random() - 0.5) * Math.PI * 0.4; // ±36 degrees
        const direction = Math.random() < 0.5 ? 1 : -1;
        const speed = this.ball.baseSpeed * this.ballSpeedMultiplier * this.speedMultiplier;

        this.ball.speedX = Math.cos(angle) * speed * direction;
        this.ball.speedY = Math.sin(angle) * speed;
        this.ball.trail = [];

        // Reset scoring flag for new round
        this.ballScored = false;
    }

    resetPaddles() {
        this.paddle1.y = (this.canvas.height - this.paddle1.height) / 2;
        this.paddle1.targetY = this.paddle1.y;
        this.paddle2.x = this.canvas.width - this.paddle2.width - 20;
        this.paddle2.y = (this.canvas.height - this.paddle2.height) / 2;
        this.paddle2.targetY = this.paddle2.y;
        this.paddle2.currentY = this.paddle2.y;
        this.paddle2.reactionDelay = 0;
        this.paddle2.lastUpdate = 0;
    }

    update(deltaTime) {
        if (this.gameState !== 'playing') return;

        const dt = Math.min(deltaTime / 16.67, 2);

        // Update player paddle - IMMEDIATE response
        this.paddle1.y = this.paddle1.targetY;

        // Keep player paddle in bounds
        this.paddle1.y = Math.max(0, Math.min(this.canvas.height - this.paddle1.height, this.paddle1.y));

        // Update AI paddle with realistic human-like behavior
        this.updateAI(dt);

        // Update ball
        this.ball.x += this.ball.speedX * dt;
        this.ball.y += this.ball.speedY * dt;

        // Add to trail with better length based on speed
        const speed = Math.sqrt(this.ball.speedX ** 2 + this.ball.speedY ** 2);
        this.ball.trail.push({
            x: this.ball.x,
            y: this.ball.y,
            alpha: 1,
            size: this.ball.radius * (0.5 + speed / 20)
        });

        const maxTrailLength = Math.min(20, Math.max(8, speed * 2));
        if (this.ball.trail.length > maxTrailLength) {
            this.ball.trail.shift();
        }

        // Update trail alpha
        this.ball.trail.forEach((point, index) => {
            point.alpha = (index / this.ball.trail.length) * 0.8;
        });

        // Ball collision with top and bottom walls - Proper physics
        if (this.ball.y - this.ball.radius <= 0 || this.ball.y + this.ball.radius >= this.canvas.height) {
            // Simple physics: reverse Y direction (angle of incidence = angle of reflection)
            this.ball.speedY = -this.ball.speedY;

            // Keep ball in bounds
            this.ball.y = Math.max(this.ball.radius, Math.min(this.canvas.height - this.ball.radius, this.ball.y));

            // Visual and audio effects
            this.createParticles(this.ball.x, this.ball.y, '#00ffff', 6);
            this.screenShake = 2;
            this.playSound(280, 0.08, 'square', 0.25); // Consistent wall sound
        }

        // Ball collision with paddles
        this.checkPaddleCollision();

        // Ball out of bounds (scoring) - Prevent multiple scoring with flag
        if (!this.ballScored) {
            if (this.ball.x < -this.ball.radius - 50) {
                this.ballScored = true;
                this.score.player2++;
                this.handleScore('player2');
            } else if (this.ball.x > this.canvas.width + this.ball.radius + 50) {
                this.ballScored = true;
                this.score.player1++;
                this.handleScore('player1');
            }
        }

        // Update particles
        this.updateParticles(dt);

        // Update screen shake
        if (this.screenShake > 0) {
            this.screenShake *= 0.9;
            if (this.screenShake < 0.1) this.screenShake = 0;
        }
    }

    updateAI(dt) {
        const currentTime = performance.now();

        // Reaction delay based on difficulty
        const reactionTime = {
            easy: 180,   // 180ms delay
            medium: 100, // 100ms delay  
            hard: 50     // 50ms delay
        };

        const aiReactionTime = reactionTime.medium;

        // Update AI reaction delay
        this.paddle2.reactionDelay -= dt * 16.67;

        // Only update AI target when reaction delay is over
        if (this.paddle2.reactionDelay <= 0) {
            let targetY;

            // AI behavior based on ball direction and position
            if (this.ball.speedX > 0) {
                // Ball is coming towards AI - be more reactive
                const ballDistanceFromAI = this.paddle2.x - this.ball.x;

                if (ballDistanceFromAI < 200) {
                    // Close to AI - track ball position more directly
                    targetY = this.ball.y;
                } else {
                    // Ball is far - simple prediction without wall bounces
                    const timeToReach = ballDistanceFromAI / this.ball.speedX;
                    targetY = this.ball.y + (this.ball.speedY * timeToReach);

                    // Don't calculate wall bounces - let AI be surprised by them
                    // This makes the AI more human-like and beatable
                }
            } else {
                // Ball going away from AI - return to center position
                targetY = this.canvas.height / 2;
            }

            // Add difficulty-based accuracy
            const accuracy = {
                easy: 0.6,    // 60% accuracy
                medium: 0.8,  // 80% accuracy  
                hard: 0.95    // 95% accuracy
            };

            const aiAccuracy = accuracy.medium;

            // Add error based on accuracy - less accurate = more error
            const maxError = (1 - aiAccuracy) * 60; // Max 24px error on easy
            const error = (Math.random() - 0.5) * maxError;
            targetY += error;

            // Add some laziness - AI doesn't always react to small movements
            const lazyThreshold = {
                easy: 25,    // Only react if ball moved 25+ pixels
                medium: 15,  // Only react if ball moved 15+ pixels
                hard: 5      // Only react if ball moved 5+ pixels
            };

            const threshold = lazyThreshold.medium;
            const currentTargetDiff = Math.abs(targetY - this.paddle2.targetY);

            if (currentTargetDiff > threshold) {
                // Calculate target position (center of paddle should be at target)
                this.paddle2.targetY = targetY - this.paddle2.height / 2;

                // Reset reaction delay
                this.paddle2.reactionDelay = aiReactionTime;
            }
        }

        // Smooth movement towards target
        const targetDiff = this.paddle2.targetY - this.paddle2.y;

        // AI speed based on difficulty and urgency
        let aiSpeed = 6;

        // Speed up if ball is very close and moving fast
        if (this.ball.speedX > 0 && (this.paddle2.x - this.ball.x) < 100) {
            const ballSpeed = Math.sqrt(this.ball.speedX ** 2 + this.ball.speedY ** 2);
            const urgencyMultiplier = Math.min(ballSpeed / 8, 1.5);
            aiSpeed *= urgencyMultiplier;
        }

        // Apply movement with realistic acceleration
        if (Math.abs(targetDiff) > 2) {
            const moveAmount = Math.min(Math.abs(targetDiff), aiSpeed * dt);
            this.paddle2.y += targetDiff > 0 ? moveAmount : -moveAmount;
        }

        // Keep AI paddle in bounds
        this.paddle2.y = Math.max(0, Math.min(this.canvas.height - this.paddle2.height, this.paddle2.y));

        // Add occasional hesitation (more human-like)
        if (Math.random() < 0.02) { // 2% chance per frame
            this.paddle2.reactionDelay += 50; // Add 50ms delay randomly
        }
    }

    checkPaddleCollision() {
        // Player paddle collision
        if (this.ball.x - this.ball.radius <= this.paddle1.x + this.paddle1.width &&
            this.ball.x + this.ball.radius >= this.paddle1.x &&
            this.ball.y + this.ball.radius >= this.paddle1.y &&
            this.ball.y - this.ball.radius <= this.paddle1.y + this.paddle1.height &&
            this.ball.speedX < 0) {

            this.handlePaddleHit(this.paddle1, true);
        }

        // AI paddle collision
        if (this.ball.x + this.ball.radius >= this.paddle2.x &&
            this.ball.x - this.ball.radius <= this.paddle2.x + this.paddle2.width &&
            this.ball.y + this.ball.radius >= this.paddle2.y &&
            this.ball.y - this.ball.radius <= this.paddle2.y + this.paddle2.height &&
            this.ball.speedX > 0) {

            this.handlePaddleHit(this.paddle2, false);
        }
    }

    handlePaddleHit(paddle, isPlayer) {
        // Calculate hit position relative to paddle center (-1 to +1)
        const hitPos = (this.ball.y - (paddle.y + paddle.height / 2)) / (paddle.height / 2);

        // Reverse X direction
        this.ball.speedX = -this.ball.speedX;

        // Calculate new Y speed based on hit position
        // Hit position determines angle: center = straight, edges = angled
        const maxAngle = 5; // Maximum Y speed from edge hits
        this.ball.speedY = hitPos * maxAngle;

        // Add paddle movement influence (English/spin effect)
        if (isPlayer) {
            const mouseDelta = this.mouseY - this.lastMouseY;
            this.lastMouseY = this.mouseY;

            // Convert mouse movement to spin (max ±2 speed units)
            const spin = Math.max(-2, Math.min(2, mouseDelta * 0.3));
            this.ball.speedY += spin;
        }

        // Progressive speed increase - accumulate in speedMultiplier
        const speedIncrease = this.speedIncrease;
        this.speedMultiplier *= speedIncrease;
        this.totalHits++;

        // Cap speed multiplier to prevent extreme speeds
        const maxSpeedMultiplier = 10.0; // Maximum 10x speed - increased from 3x for more excitement
        this.speedMultiplier = Math.min(this.speedMultiplier, maxSpeedMultiplier);

        // Apply speed correctly: start from base speed and apply multiplier
        const baseSpeed = this.ball.baseSpeed * this.ballSpeedMultiplier;
        const currentSpeed = baseSpeed * this.speedMultiplier;

        // Apply speed to maintain direction but use accumulated speed
        const currentBallSpeed = Math.sqrt(this.ball.speedX ** 2 + this.ball.speedY ** 2);

        // Safety check to prevent division by zero
        if (currentBallSpeed > 0.1) {
            const speedRatio = currentSpeed / currentBallSpeed;
            this.ball.speedX *= speedRatio;
            this.ball.speedY *= speedRatio;
        } else {
            // If ball speed is too low, set a minimum speed
            const direction = this.ball.speedX >= 0 ? 1 : -1;
            this.ball.speedX = currentSpeed * direction;
            this.ball.speedY = 0;
        }

        // Cap the total speed to prevent unrealistic velocities
        const totalSpeed = Math.sqrt(this.ball.speedX ** 2 + this.ball.speedY ** 2);
        if (totalSpeed > this.ball.maxSpeed) {
            const ratio = this.ball.maxSpeed / totalSpeed;
            this.ball.speedX *= ratio;
            this.ball.speedY *= ratio;
        }

        // Ensure minimum horizontal speed to keep game playable
        const minHorizontalSpeed = 3;
        if (Math.abs(this.ball.speedX) < minHorizontalSpeed) {
            this.ball.speedX = this.ball.speedX >= 0 ? minHorizontalSpeed : -minHorizontalSpeed;
        }

        // Move ball away from paddle to prevent sticking
        if (paddle === this.paddle1) {
            this.ball.x = this.paddle1.x + this.paddle1.width + this.ball.radius + 1;
        } else {
            this.ball.x = this.paddle2.x - this.ball.radius - 1;
        }

        // Visual and audio effects
        this.rallyCount++;
        const hitColor = isPlayer ? '#00ff00' : '#ff6600';
        this.createParticles(this.ball.x, this.ball.y, hitColor, 12);
        this.screenShake = 5 + Math.abs(hitPos) * 3; // More shake for edge hits

        // Sound based on hit intensity and accumulated speed
        const baseFreq = isPlayer ? 660 : 440;
        const speedBonus = Math.min(this.speedMultiplier, 10) * 50; // Updated for 10x max speed
        const angleBonus = Math.abs(hitPos) * 80; // Higher pitch for angled hits
        const rallyBonus = Math.min(this.rallyCount * 15, 200);

        this.playSound(baseFreq + speedBonus + angleBonus + rallyBonus, 0.12, 'square', 0.35);
    }

    createParticles(x, y, color, count = 10) {
        for (let i = 0; i < count; i++) {
            const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
            const speed = 2 + Math.random() * 4;
            const size = 2 + Math.random() * 4;

            this.particles.push({
                x: x,
                y: y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                size: size,
                color: color,
                alpha: 1,
                life: 1,
                decay: 0.02 + Math.random() * 0.02
            });
        }

        // Remove excess particles
        if (this.particles.length > this.maxParticles) {
            this.particles.splice(0, this.particles.length - this.maxParticles);
        }
    }

    updateParticles(dt) {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const particle = this.particles[i];

            particle.x += particle.vx * dt;
            particle.y += particle.vy * dt;

            // Apply gravity to confetti for more realistic movement
            if (particle.shape) {
                particle.vy += 0.2 * dt; // Gravity effect
            }

            // Update rotation for confetti
            if (particle.rotation !== undefined) {
                particle.rotation += particle.rotationSpeed * dt;
            }

            // Update twinkling effect for sparkles
            if (particle.twinkle) {
                particle.alpha = 0.5 + 0.5 * Math.sin(Date.now() * particle.twinkleSpeed * 0.01);
            } else {
                particle.life -= particle.decay * dt;
                particle.alpha = particle.life;
            }

            particle.size *= 0.98;

            // Remove particles that are too old, too small, or have fallen off screen
            if (particle.life <= 0 || particle.size < 0.5 ||
                (particle.shape && particle.y > this.canvas.height + 50)) {
                this.particles.splice(i, 1);
            }
        }
    }

    handleScore(scorer) {
        this.updateScoreDisplay();

        // Reset rally count and speed multiplier for each new round
        this.rallyCount = 0;
        this.speedMultiplier = 1; // Reset speed to base level for new round

        // Enhanced goal celebration effects
        this.celebrateGoal(scorer);

        // Check if game should end (first to reach maxScore wins)
        if (this.score.player1 >= this.maxScore || this.score.player2 >= this.maxScore) {
            // End the game
            setTimeout(() => {
                this.endGame();
            }, 2000); // Increased delay to enjoy the celebration
        } else {
            // Continue the game - reset ball after a delay
            setTimeout(() => {
                if (this.gameState === 'playing') {
                    this.resetBall();
                }
            }, 2500); // Increased delay for better celebration viewing
        }
    }

    celebrateGoal(scorer) {
        const isPlayerGoal = scorer === 'player1';
        const goalColor = isPlayerGoal ? '#00ff00' : '#ff6600'; // Match paddle colors exactly
        const celebrationX = isPlayerGoal ? this.canvas.width / 4 : 3 * this.canvas.width / 4;
        const celebrationY = this.canvas.height / 2;

        // Massive screen shake for dramatic effect
        this.screenShake = 25;

        // Multi-wave particle explosion
        this.createGoalExplosion(celebrationX, celebrationY, goalColor);

        // Enhanced sound celebration sequence
        this.playGoalSounds(isPlayerGoal);

        // Add goal text animation
        this.showGoalText(scorer);
    }

    createGoalExplosion(x, y, primaryColor) {
        // Wave 1: Large explosion burst
        this.createParticles(x, y, primaryColor, 40);

        // Wave 2: Secondary colored particles
        const secondaryColor = primaryColor === '#00ff00' ? '#ffff00' : '#ff6600';
        setTimeout(() => {
            this.createParticles(x, y, secondaryColor, 30);
        }, 100);

        // Wave 3: White sparkles
        setTimeout(() => {
            this.createParticles(x, y, '#ffffff', 25);
        }, 200);

        // Wave 4: Rainbow confetti burst
        setTimeout(() => {
            const colors = ['#ff0080', '#0080ff', '#80ff00', '#ff8000', '#8000ff'];
            colors.forEach((color, index) => {
                setTimeout(() => {
                    this.createConfetti(x, y, color, 15);
                }, index * 50);
            });
        }, 300);

        // Wave 5: Final sparkle shower
        setTimeout(() => {
            for (let i = 0; i < 5; i++) {
                setTimeout(() => {
                    const sparkleX = x + (Math.random() - 0.5) * 200;
                    const sparkleY = y + (Math.random() - 0.5) * 150;
                    this.createSparkles(sparkleX, sparkleY, '#ffffff', 8);
                }, i * 100);
            }
        }, 500);
    }

    createConfetti(x, y, color, count) {
        for (let i = 0; i < count; i++) {
            const angle = (Math.PI * 2 * i) / count + Math.random() * 1.0;
            const speed = 3 + Math.random() * 6;
            const size = 3 + Math.random() * 5;

            this.particles.push({
                x: x,
                y: y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - 2, // Slight upward bias
                size: size,
                color: color,
                alpha: 1,
                life: 1.5, // Longer life for confetti
                decay: 0.015 + Math.random() * 0.01,
                rotation: Math.random() * Math.PI * 2,
                rotationSpeed: (Math.random() - 0.5) * 0.3,
                shape: Math.random() < 0.5 ? 'circle' : 'square'
            });
        }
    }

    createSparkles(x, y, color, count) {
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 1 + Math.random() * 3;
            const size = 1 + Math.random() * 3;

            this.particles.push({
                x: x,
                y: y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                size: size,
                color: color,
                alpha: 1,
                life: 1,
                decay: 0.03 + Math.random() * 0.02,
                twinkle: true,
                twinkleSpeed: 0.1 + Math.random() * 0.1
            });
        }
    }

    playGoalSounds(isPlayerGoal) {
        if (isPlayerGoal) {
            // Player goal celebration - triumphant fanfare
            setTimeout(() => this.playSound(523, 0.15, 'square', 0.6), 0);     // C5
            setTimeout(() => this.playSound(659, 0.15, 'square', 0.6), 150);   // E5
            setTimeout(() => this.playSound(784, 0.15, 'square', 0.6), 300);   // G5
            setTimeout(() => this.playSound(1047, 0.3, 'square', 0.7), 450);   // C6 - victory!

            // Add some sparkle sounds
            setTimeout(() => this.playSound(1318, 0.1, 'sine', 0.4), 600);     // Sparkle 1
            setTimeout(() => this.playSound(1567, 0.1, 'sine', 0.4), 700);     // Sparkle 2
            setTimeout(() => this.playSound(1975, 0.15, 'sine', 0.5), 800);    // Final sparkle
        } else {
            // Computer goal - dramatic but ominous
            setTimeout(() => this.playSound(196, 0.2, 'sawtooth', 0.5), 0);     // G3
            setTimeout(() => this.playSound(220, 0.2, 'sawtooth', 0.5), 200);   // A3
            setTimeout(() => this.playSound(246, 0.2, 'sawtooth', 0.5), 400);   // B3
            setTimeout(() => this.playSound(130, 0.4, 'sawtooth', 0.6), 600);   // C3 - defeat

            // Add some warning sounds
            setTimeout(() => this.playSound(110, 0.1, 'triangle', 0.3), 800);   // Warning 1
            setTimeout(() => this.playSound(98, 0.1, 'triangle', 0.3), 900);    // Warning 2
            setTimeout(() => this.playSound(87, 0.2, 'triangle', 0.4), 1000);   // Final warning
        }
    }

    showGoalText(scorer) {
        // Create goal text effect
        const isPlayerGoal = scorer === 'player1';
        const goalText = 'GOAL!'; // Same text for both players, no "AI" reference
        const textColor = isPlayerGoal ? '#00ff00' : '#ff6600'; // Match paddle colors exactly

        // Store goal text data for rendering
        this.goalTextEffect = {
            text: goalText,
            color: textColor,
            scale: 0,
            alpha: 1,
            duration: 2000,
            startTime: Date.now(),
            pulseSpeed: 0.1
        };

        // Remove goal text after duration
        setTimeout(() => {
            this.goalTextEffect = null;
        }, 2000);
    }

    endGame() {
        this.gameState = 'gameOver';
        const winner = this.score.player1 >= this.maxScore ? 'Player' : 'Computer';
        this.winnerText.textContent = `${winner} wins!`;
        this.showMessage('game-over');
        this.pauseBtn.querySelector('.btn-text').textContent = 'Pause';

        // Game over sound sequence
        if (this.score.player1 >= this.maxScore) {
            // Victory fanfare
            setTimeout(() => this.playSound(523, 0.2, 'square', 0.4), 0);
            setTimeout(() => this.playSound(659, 0.2, 'square', 0.4), 200);
            setTimeout(() => this.playSound(784, 0.4, 'square', 0.4), 400);
        } else {
            // Defeat sound
            this.playSound(220, 0.8, 'sawtooth', 0.3);
        }

        // Final particles explosion
        this.createParticles(this.canvas.width / 2, this.canvas.height / 2, winner === 'Player' ? '#00ff00' : '#ff6600', 30);
    }

    updateScoreDisplay() {
        this.player1ScoreEl.textContent = this.score.player1;
        this.player2ScoreEl.textContent = this.score.player2;

        // Score animation
        const scoreEl = document.querySelector('.score');
        scoreEl.classList.remove('score-update');
        setTimeout(() => scoreEl.classList.add('score-update'), 10);
        setTimeout(() => scoreEl.classList.remove('score-update'), 500);
    }

    render(currentTime = 0) {
        const deltaTime = currentTime - this.lastTime;

        if (deltaTime >= this.frameInterval) {
            this.update(deltaTime);
            this.draw();
            this.lastTime = currentTime;
        }

        this.animationId = requestAnimationFrame((time) => this.render(time));
    }

    draw() {
        // Apply screen shake
        if (this.screenShake > 0) {
            this.ctx.save();
            this.ctx.translate(
                (Math.random() - 0.5) * this.screenShake,
                (Math.random() - 0.5) * this.screenShake
            );
        }

        // Clear canvas with subtle trail effect
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw background effects
        this.drawBackgroundEffects();

        // Draw center line
        this.drawCenterLine();

        // Draw paddles
        this.drawPaddle(this.paddle1, '#00ff00');
        this.drawPaddle(this.paddle2, '#ff6600');

        // Draw particles
        this.drawParticles();

        // Draw ball trail
        this.drawBallTrail();

        // Draw ball
        this.drawBall();

        // Draw speed effects
        this.drawSpeedEffects();

        // Draw rally counter
        this.drawRallyCounter();

        // Draw goal text effect (if active)
        if (this.goalTextEffect) {
            this.drawGoalText();
        }

        // Restore context if screen shake was applied
        if (this.screenShake > 0) {
            this.ctx.restore();
        }
    }

    drawBackgroundEffects() {
        // Modern geometric background with multiple layers - PERFECT CENTER ALIGNMENT

        // Layer 1: Dynamic radial gradient base - perfectly centered
        const time = Date.now() * 0.0005;
        const centerX = Math.floor(this.canvas.width / 2);
        const centerY = Math.floor(this.canvas.height / 2);
        const maxRadius = Math.max(this.canvas.width, this.canvas.height) * 0.7;

        const gradient = this.ctx.createRadialGradient(
            centerX, centerY, 0,
            centerX, centerY, maxRadius
        );
        gradient.addColorStop(0, 'rgba(15, 25, 50, 0.1)');
        gradient.addColorStop(0.5, 'rgba(25, 35, 65, 0.05)');
        gradient.addColorStop(1, 'rgba(5, 15, 30, 0.15)');

        this.ctx.fillStyle = gradient;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Layer 2: Modern hexagonal pattern - centered
        this.drawHexagonalPattern();

        // Layer 3: Floating geometric shapes - centered
        this.drawFloatingShapes(time, centerX, centerY);

        // Layer 4: Subtle scan lines for tech feel
        this.drawScanLines();

        // Layer 5: Corner accent lines - perfectly aligned
        this.drawCornerAccents();
    }

    drawHexagonalPattern() {
        const hexSize = 40;
        const hexWidth = hexSize * Math.sqrt(3);
        const hexHeight = hexSize * 2;

        // Calculate offset to center the pattern
        const centerX = this.canvas.width / 2;
        const centerY = this.canvas.height / 2;
        const offsetX = centerX % hexWidth - hexWidth / 2;
        const offsetY = centerY % (hexHeight * 0.75) - hexHeight * 0.375;

        this.ctx.strokeStyle = 'rgba(100, 150, 255, 0.08)';
        this.ctx.lineWidth = 1;

        for (let row = -2; row < this.canvas.height / (hexHeight * 0.75) + 2; row++) {
            for (let col = -2; col < this.canvas.width / hexWidth + 2; col++) {
                const x = col * hexWidth + (row % 2) * (hexWidth / 2) + offsetX;
                const y = row * (hexHeight * 0.75) + offsetY;

                // Only draw hexagons that are visible on canvas
                if (x > -hexSize && x < this.canvas.width + hexSize &&
                    y > -hexSize && y < this.canvas.height + hexSize) {
                    this.drawHexagon(x, y, hexSize * 0.8);
                }
            }
        }
    }

    drawHexagon(centerX, centerY, size) {
        this.ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            const angle = (Math.PI / 3) * i;
            const x = centerX + size * Math.cos(angle);
            const y = centerY + size * Math.sin(angle);

            if (i === 0) {
                this.ctx.moveTo(x, y);
            } else {
                this.ctx.lineTo(x, y);
            }
        }
        this.ctx.closePath();
        this.ctx.stroke();
    }

    drawFloatingShapes(time, centerX, centerY) {
        // Modern floating triangles and circles - perfectly distributed around center
        const shapes = [
            { x: 0.2, y: 0.3, size: 30, type: 'triangle', speed: 0.3 },
            { x: 0.8, y: 0.7, size: 25, type: 'circle', speed: 0.5 },
            { x: 0.1, y: 0.8, size: 20, type: 'triangle', speed: 0.4 },
            { x: 0.9, y: 0.2, size: 35, type: 'circle', speed: 0.2 },
            { x: 0.5, y: 0.1, size: 15, type: 'diamond', speed: 0.6 }
        ];

        shapes.forEach((shape, index) => {
            // Calculate position relative to center for better symmetry
            const baseX = (shape.x - 0.5) * this.canvas.width + centerX;
            const baseY = (shape.y - 0.5) * this.canvas.height + centerY;

            const x = baseX + Math.sin(time * shape.speed + index) * 20;
            const y = baseY + Math.cos(time * shape.speed + index) * 15;
            const alpha = 0.03 + Math.sin(time + index) * 0.02;

            this.ctx.fillStyle = `rgba(150, 200, 255, ${alpha})`;
            this.ctx.strokeStyle = `rgba(200, 230, 255, ${alpha * 2})`;
            this.ctx.lineWidth = 1;

            this.ctx.beginPath();

            if (shape.type === 'triangle') {
                this.ctx.moveTo(x, y - shape.size);
                this.ctx.lineTo(x - shape.size * 0.866, y + shape.size * 0.5);
                this.ctx.lineTo(x + shape.size * 0.866, y + shape.size * 0.5);
                this.ctx.closePath();
            } else if (shape.type === 'circle') {
                this.ctx.arc(x, y, shape.size, 0, Math.PI * 2);
            } else if (shape.type === 'diamond') {
                this.ctx.moveTo(x, y - shape.size);
                this.ctx.lineTo(x + shape.size, y);
                this.ctx.lineTo(x, y + shape.size);
                this.ctx.lineTo(x - shape.size, y);
                this.ctx.closePath();
            }

            this.ctx.fill();
            this.ctx.stroke();
        });
    }

    drawScanLines() {
        // Subtle horizontal scan lines for modern tech aesthetic
        this.ctx.strokeStyle = 'rgba(0, 255, 150, 0.02)';
        this.ctx.lineWidth = 1;

        for (let y = 0; y < this.canvas.height; y += 4) {
            this.ctx.beginPath();
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(this.canvas.width, y);
            this.ctx.stroke();
        }
    }

    drawCornerAccents() {
        // Modern corner decorations
        const accentLength = 60;
        const offset = 20;

        this.ctx.strokeStyle = 'rgba(100, 200, 255, 0.15)';
        this.ctx.lineWidth = 2;

        // Top-left corner
        this.ctx.beginPath();
        this.ctx.moveTo(offset, offset + accentLength);
        this.ctx.lineTo(offset, offset);
        this.ctx.lineTo(offset + accentLength, offset);
        this.ctx.stroke();

        // Top-right corner
        this.ctx.beginPath();
        this.ctx.moveTo(this.canvas.width - offset - accentLength, offset);
        this.ctx.lineTo(this.canvas.width - offset, offset);
        this.ctx.lineTo(this.canvas.width - offset, offset + accentLength);
        this.ctx.stroke();

        // Bottom-left corner
        this.ctx.beginPath();
        this.ctx.moveTo(offset, this.canvas.height - offset - accentLength);
        this.ctx.lineTo(offset, this.canvas.height - offset);
        this.ctx.lineTo(offset + accentLength, this.canvas.height - offset);
        this.ctx.stroke();

        // Bottom-right corner
        this.ctx.beginPath();
        this.ctx.moveTo(this.canvas.width - offset - accentLength, this.canvas.height - offset);
        this.ctx.lineTo(this.canvas.width - offset, this.canvas.height - offset);
        this.ctx.lineTo(this.canvas.width - offset, this.canvas.height - offset - accentLength);
        this.ctx.stroke();
    }

    drawCenterLine() {
        // Modern center line with gradient and subtle glow - PERFECT CENTER ALIGNMENT
        const centerX = Math.floor(this.canvas.width / 2); // Ensure integer pixel alignment

        // Create a vertical gradient for the center line
        const gradient = this.ctx.createLinearGradient(centerX - 2, 0, centerX + 2, 0);
        gradient.addColorStop(0, 'rgba(100, 200, 255, 0.2)');
        gradient.addColorStop(0.5, 'rgba(150, 220, 255, 0.6)');
        gradient.addColorStop(1, 'rgba(100, 200, 255, 0.2)');

        // Draw the main center line with gradient - perfectly centered
        this.ctx.fillStyle = gradient;
        this.ctx.fillRect(centerX - 1, 0, 2, this.canvas.height);

        // Add modern dotted accent - perfectly centered
        this.ctx.fillStyle = 'rgba(200, 240, 255, 0.4)';
        const dotSize = 3;
        const spacing = 20;

        for (let y = spacing; y < this.canvas.height; y += spacing * 2) {
            this.ctx.beginPath();
            this.ctx.arc(centerX, y, dotSize, 0, Math.PI * 2);
            this.ctx.fill();
        }

        // Add subtle side accents - perfectly aligned to center
        this.ctx.strokeStyle = 'rgba(100, 180, 255, 0.3)';
        this.ctx.lineWidth = 1;

        this.ctx.beginPath();
        this.ctx.moveTo(centerX - 10, 0);
        this.ctx.lineTo(centerX - 10, this.canvas.height);
        this.ctx.stroke();

        this.ctx.beginPath();
        this.ctx.moveTo(centerX + 10, 0);
        this.ctx.lineTo(centerX + 10, this.canvas.height);
        this.ctx.stroke();
    }

    drawPaddle(paddle, color) {
        // Reduced glow effect for better readability
        this.ctx.shadowColor = color;
        this.ctx.shadowBlur = 8; // Fixed moderate glow instead of animated

        // Main paddle with subtle gradient
        const gradient = this.ctx.createLinearGradient(paddle.x, paddle.y, paddle.x + paddle.width, paddle.y + paddle.height);
        gradient.addColorStop(0, color);
        gradient.addColorStop(0.5, '#ffffff');
        gradient.addColorStop(1, color);

        this.ctx.fillStyle = gradient;
        this.ctx.fillRect(paddle.x, paddle.y, paddle.width, paddle.height);

        // Reset shadow
        this.ctx.shadowBlur = 0;

        // Simple border instead of energy border
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(paddle.x, paddle.y, paddle.width, paddle.height);

        // Clean highlight lines
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        this.ctx.fillRect(paddle.x + 1, paddle.y + 1, paddle.width - 2, 2);
        this.ctx.fillRect(paddle.x + 1, paddle.y + paddle.height - 3, paddle.width - 2, 2);
    }

    drawParticles() {
        this.particles.forEach(particle => {
            this.ctx.save();
            this.ctx.globalAlpha = particle.alpha;
            this.ctx.fillStyle = particle.color;
            this.ctx.shadowColor = particle.color;
            this.ctx.shadowBlur = particle.size * 2;

            // Apply rotation for confetti
            if (particle.rotation !== undefined) {
                this.ctx.translate(particle.x, particle.y);
                this.ctx.rotate(particle.rotation);

                // Draw different shapes based on particle type
                if (particle.shape === 'square') {
                    this.ctx.fillRect(-particle.size, -particle.size, particle.size * 2, particle.size * 2);
                } else {
                    // Default circle shape
                    this.ctx.beginPath();
                    this.ctx.arc(0, 0, particle.size, 0, Math.PI * 2);
                    this.ctx.fill();
                }
            } else {
                // Regular particles (circles)
                this.ctx.beginPath();
                this.ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
                this.ctx.fill();
            }

            this.ctx.restore();
        });
    }

    drawBallTrail() {
        this.ball.trail.forEach((point, index) => {
            const alpha = point.alpha;
            const size = point.size * alpha;

            this.ctx.save();
            this.ctx.globalAlpha = alpha;
            this.ctx.fillStyle = '#ffffff';
            this.ctx.shadowColor = '#ffffff';
            this.ctx.shadowBlur = size;

            this.ctx.beginPath();
            this.ctx.arc(point.x, point.y, size * 0.6, 0, Math.PI * 2);
            this.ctx.fill();

            this.ctx.restore();
        });
    }

    drawBall() {
        const speed = Math.sqrt(this.ball.speedX ** 2 + this.ball.speedY ** 2);
        const intensity = Math.min(speed / this.ball.maxSpeed, 1);

        // Dynamic glow based on speed
        this.ctx.shadowColor = `rgba(255, 255, 255, ${0.8 + intensity * 0.2})`;
        this.ctx.shadowBlur = this.ball.glowSize + intensity * 10;

        // Main ball with dynamic gradient
        const gradient = this.ctx.createRadialGradient(
            this.ball.x - 3, this.ball.y - 3, 0,
            this.ball.x, this.ball.y, this.ball.radius
        );
        gradient.addColorStop(0, '#ffffff');
        gradient.addColorStop(0.7, `rgba(255, 255, 255, ${0.8 - intensity * 0.3})`);
        gradient.addColorStop(1, `rgba(200, 200, 255, ${0.6 + intensity * 0.4})`);

        this.ctx.fillStyle = gradient;
        this.ctx.beginPath();
        this.ctx.arc(this.ball.x, this.ball.y, this.ball.radius, 0, Math.PI * 2);
        this.ctx.fill();

        // Reset shadow
        this.ctx.shadowBlur = 0;

        // Speed indicator ring
        if (speed > this.ball.baseSpeed * 1.5) {
            this.ctx.strokeStyle = `rgba(255, 255, 0, ${intensity * 0.8})`;
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            this.ctx.arc(this.ball.x, this.ball.y, this.ball.radius + 3, 0, Math.PI * 2);
            this.ctx.stroke();
        }
    }

    drawSpeedEffects() {
        const speed = Math.sqrt(this.ball.speedX ** 2 + this.ball.speedY ** 2);

        if (speed > this.ball.baseSpeed * 1.3) {
            const lineLength = speed * 4;
            const lineCount = Math.min(5, Math.floor(speed / 2));

            this.ctx.strokeStyle = `rgba(255, 255, 255, ${Math.min(speed / 15, 0.7)})`;
            this.ctx.lineWidth = 1;

            for (let i = 0; i < lineCount; i++) {
                this.ctx.beginPath();
                this.ctx.moveTo(
                    this.ball.x - (this.ball.speedX / speed) * lineLength - i * 8,
                    this.ball.y - (this.ball.speedY / speed) * lineLength + (i - lineCount / 2) * 3
                );
                this.ctx.lineTo(
                    this.ball.x - (this.ball.speedX / speed) * (lineLength * 0.3) - i * 4,
                    this.ball.y - (this.ball.speedY / speed) * (lineLength * 0.3) + (i - lineCount / 2) * 2
                );
                this.ctx.stroke();
            }
        }
    }

    drawRallyCounter() {
        const centerX = Math.floor(this.canvas.width / 2); // Perfect center alignment

        if (this.rallyCount > 5) {
            this.ctx.save();
            this.ctx.font = `bold 24px Courier New`;
            this.ctx.fillStyle = `rgba(255, 255, 0, 0.9)`;
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle'; // Ensure vertical text centering
            this.ctx.shadowColor = '#000000';
            this.ctx.shadowBlur = 2;
            this.ctx.shadowOffsetX = 1;
            this.ctx.shadowOffsetY = 1;

            const text = `RALLY ${this.rallyCount}!`;
            this.ctx.fillText(text, centerX, 100);

            this.ctx.restore();
        }

        // Show speed multiplier when it's above 1.0
        if (this.speedMultiplier > 1.0) {
            this.ctx.save();
            this.ctx.font = `bold 18px Courier New`;
            this.ctx.fillStyle = `rgba(255, 128, 0, 0.9)`;
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle'; // Ensure vertical text centering
            this.ctx.shadowColor = '#000000';
            this.ctx.shadowBlur = 2;
            this.ctx.shadowOffsetX = 1;
            this.ctx.shadowOffsetY = 1;

            const speedText = `SPEED: ${this.speedMultiplier.toFixed(2)}x`;
            this.ctx.fillText(speedText, centerX, 130);

            this.ctx.restore();
        }
    }

    drawGoalText() {
        if (!this.goalTextEffect) return;

        const currentTime = Date.now();
        const elapsedTime = currentTime - this.goalTextEffect.startTime;
        const progress = elapsedTime / this.goalTextEffect.duration;

        // Animate scale: start small, grow quickly, then shrink slightly
        let scale;
        if (progress < 0.2) {
            scale = progress / 0.2; // Grow from 0 to 1 in first 20%
        } else if (progress < 0.8) {
            scale = 1 + 0.3 * Math.sin((progress - 0.2) * Math.PI * 4); // Pulse effect
        } else {
            scale = 1 - (progress - 0.8) * 0.5; // Fade out and shrink
        }

        // Animate alpha: fade in, stay, then fade out
        let alpha;
        if (progress < 0.1) {
            alpha = progress / 0.1;
        } else if (progress < 0.9) {
            alpha = 1;
        } else {
            alpha = 1 - (progress - 0.9) / 0.1;
        }

        this.ctx.save();
        this.ctx.globalAlpha = alpha;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';

        // Multiple text layers for dramatic effect
        const centerX = Math.floor(this.canvas.width / 2);
        const centerY = Math.floor(this.canvas.height / 2);

        // Back glow layer
        this.ctx.font = `bold ${Math.floor(72 * scale)}px Courier New`;
        this.ctx.fillStyle = this.goalTextEffect.color;
        this.ctx.shadowColor = this.goalTextEffect.color;
        this.ctx.shadowBlur = 20;
        this.ctx.fillText(this.goalTextEffect.text, centerX, centerY);

        // Main text layer
        this.ctx.font = `bold ${Math.floor(64 * scale)}px Courier New`;
        this.ctx.fillStyle = '#ffffff';
        this.ctx.shadowColor = '#000000';
        this.ctx.shadowBlur = 4;
        this.ctx.shadowOffsetX = 2;
        this.ctx.shadowOffsetY = 2;
        this.ctx.fillText(this.goalTextEffect.text, centerX, centerY);

        // Front highlight layer
        this.ctx.font = `bold ${Math.floor(56 * scale)}px Courier New`;
        this.ctx.fillStyle = this.goalTextEffect.color;
        this.ctx.shadowBlur = 0;
        this.ctx.fillText(this.goalTextEffect.text, centerX, centerY - 2);

        this.ctx.restore();
    }

    showMessage(messageId) {
        this.hideAllMessages();
        document.getElementById(messageId).classList.remove('hidden');
    }

    hideAllMessages() {
        this.startMessage.classList.add('hidden');
        this.pauseMessage.classList.add('hidden');
        this.gameOverMessage.classList.add('hidden');
    }

    toggleFullscreen() {
        if (this.isMobile) {
            // Mobile-specific fullscreen approach
            this.toggleMobileFullscreen();
        } else {
            // Desktop fullscreen API
            this.toggleDesktopFullscreen();
        }
    }

    toggleMobileFullscreen() {
        if (!this.isFullscreen) {
            // Enter mobile fullscreen mode
            this.enterMobileFullscreen();
        } else {
            // Exit mobile fullscreen mode
            this.exitMobileFullscreen();
        }
    }

    enterMobileFullscreen() {
        // Hide browser UI and maximize game area
        const container = this.gameContainer;
        const body = document.body;

        // Add fullscreen classes
        body.classList.add('mobile-fullscreen');
        container.classList.add('mobile-fullscreen');

        // Try to hide address bar by scrolling
        window.scrollTo(0, 1);

        // Force viewport resize
        setTimeout(() => {
            window.scrollTo(0, 1);
            // Trigger resize after DOM updates
            window.dispatchEvent(new Event('resize'));
        }, 100);

        this.isFullscreen = true;
        this.updateFullscreenButton();

        // Lock orientation to landscape if possible
        if (screen.orientation && screen.orientation.lock) {
            screen.orientation.lock('landscape').catch(() => {
                // Orientation lock failed, that's okay
            });
        }
    }

    exitMobileFullscreen() {
        const container = this.gameContainer;
        const body = document.body;

        // Remove fullscreen classes
        body.classList.remove('mobile-fullscreen');
        container.classList.remove('mobile-fullscreen');

        this.isFullscreen = false;
        this.updateFullscreenButton();

        // Trigger resize after DOM updates
        setTimeout(() => {
            window.dispatchEvent(new Event('resize'));
        }, 100);

        // Unlock orientation
        if (screen.orientation && screen.orientation.unlock) {
            screen.orientation.unlock();
        }
    }

    toggleDesktopFullscreen() {
        if (!document.fullscreenElement) {
            // Enter fullscreen
            const element = this.gameContainer || document.documentElement;

            if (element.requestFullscreen) {
                element.requestFullscreen();
            } else if (element.mozRequestFullScreen) {
                element.mozRequestFullScreen();
            } else if (element.webkitRequestFullscreen) {
                element.webkitRequestFullscreen(Element.ALLOW_KEYBOARD_INPUT);
            } else if (element.msRequestFullscreen) {
                element.msRequestFullscreen();
            }
        } else {
            // Exit fullscreen
            if (document.exitFullscreen) {
                document.exitFullscreen();
            } else if (document.mozCancelFullScreen) {
                document.mozCancelFullScreen();
            } else if (document.webkitExitFullscreen) {
                document.webkitExitFullscreen();
            } else if (document.msExitFullscreen) {
                document.msExitFullscreen();
            }
        }
    }

    updateFullscreenButton() {
        const btnIcon = this.fullscreenBtn.querySelector('.btn-icon');
        const btnText = this.fullscreenBtn.querySelector('.btn-text');

        if (this.isMobile) {
            // Mobile fullscreen state
            if (this.isFullscreen) {
                btnIcon.textContent = '⛶';
                btnText.textContent = 'Exit Fullscreen';
            } else {
                btnIcon.textContent = '⛶';
                btnText.textContent = 'Fullscreen';
            }
        } else {
            // Desktop fullscreen state
            if (document.fullscreenElement) {
                btnIcon.textContent = '⛶';
                btnText.textContent = 'Exit Fullscreen';
            } else {
                btnIcon.textContent = '⛶';
                btnText.textContent = 'Fullscreen';
            }
        }
    }
}

// Initialize game when DOM is loaded - FIXED: Only one instance
document.addEventListener('DOMContentLoaded', () => {
    // Make sure there's only one game instance
    if (!window.pongGame) {
        window.pongGame = new PongGame();
    }
});

// Handle page visibility change
document.addEventListener('visibilitychange', () => {
    if (document.hidden && window.pongGame) {
        if (window.pongGame.gameState === 'playing') {
            window.pongGame.pauseGame();
        }
    }
}); 