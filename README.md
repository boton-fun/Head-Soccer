# Head Soccer

A local 2-player head soccer game built with **Python**, using **Pygame** and **PyMunk**.



## Features

- Physics-based player movement and ball dynamics
- Local multiplayer with two players on the same keyboard
- Dynamic window resizing with keys or by dragging the window edges
- Multiple unique heads, each with a special ability
- Interactive background on the customization screen



## Controls

### Player 1 (Right):
- Move left: ←
- Move right: →
- Jump: ↑
- Kick: ↓
- Use powerup: Right Shift

### Player 2 (Left):
- Move left: A
- Move right: D
- Jump: W
- Kick: S
- Use powerup: Q

### Window Controls:
- Recenter window: P
- Toggle fullscreen: U
- Increase window size: O
- Decrease window size: I



## Powerups

| Head | Powerup  | Description | Cooldown (seconds) | How to use | Notes |
| --- | --- | --- | --- | --- | --- |
| Nuwan | Dash | Gives a burst of speed in the direction the player is moving | 10 | Double-tap the left or right movement key |
| Dad | Freeze | Temporarily freezes the opponent, stopping their movement | 14 | Press the powerup key (Q for Player 2, Right Shift for Player 1) | Has a duration of 5 seconds|
| Mihir | Teleport | Instantly teleports the player in front of their own goal | 22 | Press the powerup key (Q for Player 2, Right Shift for Player 1) |

Each player has a powerup indicator in the top corner.  



## Notes

- Best played on a large window or external monitor.
- Window resizing works during play using keys or by dragging the edges.
- **Note:** The "What a save!" goal sound effect that happens sometimes is intentional trash talk by the announcer.



## Requirements

- Python 3
- Pygame
- PyMunk

Install dependencies:
```bash
pip install pygame pymunk
```


Created by Nuwan Dewasurendra
