/**
 * Media Generation Skill — generates SKILL.md content for the OpenClaw container.
 *
 * Teaches AI employees how to generate images with Nano Banana (Google Gemini
 * image generation) and videos with Veo 3 (Google video generation).
 *
 * Both APIs use the same GEMINI_API_KEY passed as an environment variable.
 */

export function generateMediaGenerationSkill(): string {
  return `# AI Image & Video Generation (Nano Banana + Veo 3)

You can generate high-quality images and videos from text prompts using Google's generative AI APIs. Both tools use your GEMINI_API_KEY environment variable for authentication.

## Setup

Your GEMINI_API_KEY is already available as an environment variable. Verify it:
\`\`\`bash
echo "Key present: $([ -n "$GEMINI_API_KEY" ] && echo 'yes' || echo 'no')"
\`\`\`

If the key is missing, ask your manager to provide a Gemini API key (from https://aistudio.google.com/apikey), then store it:
\`\`\`bash
# If manager provides a key manually
cred store gemini api_key <the-key>
# Then export for use:
export GEMINI_API_KEY=$(cred get-raw gemini api_key)
\`\`\`

---

## Image Generation — Nano Banana (Gemini Image)

### Quick Start
\`\`\`bash
generate-image "A professional logo for a tech startup called Nexus, minimalist, blue and white" logo.png
\`\`\`
This saves the generated image to your workspace at \`/home/node/.openclaw/workspace-main/logo.png\`.

### Using the CLI wrapper (\`generate-image\`)

\`\`\`bash
# Basic usage
generate-image "<prompt>" <output-filename>

# Custom aspect ratio (default: 1:1)
generate-image "<prompt>" <output-filename> <aspect-ratio>

# Examples
generate-image "A sunset over the ocean, photorealistic" sunset.png
generate-image "Social media banner for a coffee shop, warm tones" banner.png 16:9
generate-image "Instagram story graphic for a fitness brand" story.png 9:16
generate-image "Product mockup of a sleek water bottle on a marble surface" product.png 4:3
\`\`\`

**Supported aspect ratios:** 1:1, 2:3, 3:2, 3:4, 4:3, 4:5, 5:4, 9:16, 16:9, 21:9

### Direct API Usage (Python)

For more control (e.g., image editing, multi-image blending):

\`\`\`bash
pip3 install -q google-genai Pillow 2>/dev/null

python3 << 'PYEOF'
import os, sys
from google import genai
from google.genai import types
from PIL import Image
from io import BytesIO

client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])

# Text-to-image generation
response = client.models.generate_content(
    model="gemini-2.5-flash-image-preview",
    contents="A photorealistic image of a mountain landscape at dawn",
    config=types.GenerateContentConfig(
        response_modalities=["IMAGE"],
    ),
)

for part in response.candidates[0].content.parts:
    if part.inline_data is not None:
        img = Image.open(BytesIO(part.inline_data.data))
        out_path = "/home/node/.openclaw/workspace-main/mountain.png"
        img.save(out_path)
        print(f"Saved: {out_path}")
PYEOF
\`\`\`

### Image Editing (modify an existing image)

\`\`\`bash
python3 << 'PYEOF'
import os
from google import genai
from PIL import Image
from io import BytesIO

client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])

# Load existing image
input_image = Image.open("/home/node/.openclaw/workspace-main/photo.png")

# Edit with text instruction
response = client.models.generate_content(
    model="gemini-2.5-flash-image-preview",
    contents=[
        "Change the background to a tropical beach at sunset",
        input_image,
    ],
)

for part in response.candidates[0].content.parts:
    if part.inline_data is not None:
        result = Image.open(BytesIO(part.inline_data.data))
        out_path = "/home/node/.openclaw/workspace-main/photo-edited.png"
        result.save(out_path)
        print(f"Saved: {out_path}")
PYEOF
\`\`\`

### Multi-Image Blending

\`\`\`bash
python3 << 'PYEOF'
import os
from google import genai
from PIL import Image
from io import BytesIO

client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])

person = Image.open("/home/node/.openclaw/workspace-main/person.png")
outfit = Image.open("/home/node/.openclaw/workspace-main/dress.png")

response = client.models.generate_content(
    model="gemini-2.5-flash-image-preview",
    contents=[
        "Put this person in this outfit, keep the same pose and background",
        person,
        outfit,
    ],
)

for part in response.candidates[0].content.parts:
    if part.inline_data is not None:
        result = Image.open(BytesIO(part.inline_data.data))
        out_path = "/home/node/.openclaw/workspace-main/combined.png"
        result.save(out_path)
        print(f"Saved: {out_path}")
PYEOF
\`\`\`

### Image Generation Tips
- **Be descriptive** — the more detail in your prompt, the better the result. Include style ("photorealistic", "watercolor", "flat illustration"), subject, composition, lighting, and mood.
- **Text in images** — Nano Banana can render text in images. Specify the exact text you want: "A poster with the text 'GRAND OPENING' in bold serif font"
- **Iterate** — if the first result isn't perfect, try refining the prompt or using image editing to modify specific aspects.
- **Multiple options** — generate several variations and let the user pick their favorite.

---

## Video Generation — Veo 3

### Quick Start
\`\`\`bash
generate-video "A timelapse of a flower blooming in a garden, cinematic" flower-timelapse.mp4
\`\`\`
This generates an 8-second video and saves it to your workspace.

### Using the CLI wrapper (\`generate-video\`)

\`\`\`bash
# Basic usage (8 seconds, 16:9, with audio)
generate-video "<prompt>" <output-filename>

# Custom duration (4, 6, or 8 seconds)
generate-video "<prompt>" <output-filename> <duration>

# Examples
generate-video "A golden retriever running through a field of sunflowers at sunset" dog-running.mp4
generate-video "Ocean waves crashing on a rocky coast, slow motion, cinematic" waves.mp4 6
generate-video "A busy city street at night with neon signs and rain reflections" city-night.mp4 8
\`\`\`

**Video specs:** MP4 format, 720p resolution, 24fps. Duration: 4, 6, or 8 seconds.

### Direct API Usage (Python)

For more control (aspect ratio, audio toggle, image-to-video):

\`\`\`bash
pip3 install -q google-genai 2>/dev/null

python3 << 'PYEOF'
import os, time, base64

from google import genai
from google.genai.types import GenerateVideosConfig

client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])

print("Starting video generation (this takes 1-3 minutes)...")

operation = client.models.generate_videos(
    model="veo-3.0-generate-001",
    prompt="A cinematic shot of a cat sitting on a windowsill watching rain, cozy atmosphere",
    config=GenerateVideosConfig(
        aspect_ratio="16:9",
        number_of_videos=1,
        duration_seconds=8,
        generate_audio=True,
    ),
)

# Poll until complete
while not operation.done:
    time.sleep(15)
    operation = client.operations.get(operation)
    print("Still generating...")

if operation.response and operation.response.generated_videos:
    video = operation.response.generated_videos[0]
    # Save the video
    video_bytes = video.video.video_bytes
    if video_bytes:
        out_path = "/home/node/.openclaw/workspace-main/cat-rain.mp4"
        with open(out_path, "wb") as f:
            f.write(video_bytes)
        print(f"Saved: {out_path}")
    else:
        print(f"Video available at: {video.video.uri}")
else:
    print("Video generation failed or was filtered by safety checks.")
PYEOF
\`\`\`

### Image-to-Video (Animate a Still Image)

\`\`\`bash
python3 << 'PYEOF'
import os, time, base64
from PIL import Image
from io import BytesIO
from google import genai
from google.genai.types import GenerateVideosConfig, Image as GImage

client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])

# Read the input image
with open("/home/node/.openclaw/workspace-main/photo.png", "rb") as f:
    image_bytes = f.read()

print("Animating image into video (this takes 1-3 minutes)...")

operation = client.models.generate_videos(
    model="veo-3.0-generate-001",
    prompt="The person slowly turns and smiles at the camera, gentle wind blowing their hair",
    image=GImage(image_bytes=image_bytes, mime_type="image/png"),
    config=GenerateVideosConfig(
        aspect_ratio="16:9",
        duration_seconds=8,
        generate_audio=True,
    ),
)

while not operation.done:
    time.sleep(15)
    operation = client.operations.get(operation)
    print("Still generating...")

if operation.response and operation.response.generated_videos:
    video_bytes = operation.response.generated_videos[0].video.video_bytes
    if video_bytes:
        out_path = "/home/node/.openclaw/workspace-main/animated-photo.mp4"
        with open(out_path, "wb") as f:
            f.write(video_bytes)
        print(f"Saved: {out_path}")
else:
    print("Video generation failed.")
PYEOF
\`\`\`

### Video Generation Tips
- **Be cinematic** — Veo 3 excels at cinematic shots. Use terms like "slow motion", "timelapse", "tracking shot", "aerial view", "close-up".
- **Audio is included** — Veo 3 generates synchronized audio (dialogue, sound effects, ambient noise). Enable with \`generate_audio=True\`.
- **Duration matters** — shorter clips (4-6s) are faster to generate and cheaper. Use 8s only when needed.
- **Generation takes 1-3 minutes** — tell the user you're generating a video before starting so they know to wait.
- **Safety filters** — some prompts may be rejected by Google's safety filters. If a prompt fails, try rewording to avoid potentially sensitive content.
- **Cost awareness** — video generation costs approximately $0.15-0.40 per second of video. An 8-second video costs $1.20-3.20. Use it when the user genuinely needs video, not for trivial requests.

---

## When to Use Which Tool

| Need | Tool | Speed | Cost |
|------|------|-------|------|
| Logo, icon, banner, illustration | Nano Banana (generate-image) | ~5 seconds | ~$0.04 |
| Edit/modify existing image | Nano Banana (Python API) | ~5 seconds | ~$0.04 |
| Chart, graph, data visualization | matplotlib/Pillow (exec) | Instant | Free |
| Screenshot of a webpage | Browser screenshot | ~3 seconds | Free |
| Product demo, promo video | Veo 3 (generate-video) | 1-3 minutes | ~$1-3 |
| Animated version of an image | Veo 3 image-to-video | 1-3 minutes | ~$1-3 |
| Simple GIF | gifgrep or ffmpeg | Instant | Free |

## Sharing Generated Media

After generating an image or video, always:
1. Save it to your workspace (\`/home/node/.openclaw/workspace-main/\`)
2. Include the full path in your response
3. Add a brief description of what was generated

Example response:
"Here's the logo I generated for Nexus: /home/node/.openclaw/workspace-main/nexus-logo.png

I went with a minimalist design — clean geometric shapes in blue and white, with the company name in a modern sans-serif font."

The file will be automatically delivered on whatever channel the user is on (Slack upload, web chat inline, etc.).

## Troubleshooting

- **"GEMINI_API_KEY not set"** — Ask your manager to provide a Google Gemini API key from https://aistudio.google.com/apikey
- **"Safety filter triggered"** — Rephrase your prompt to avoid potentially sensitive content. Try being more specific about the artistic style.
- **"Quota exceeded"** — You've hit the API rate limit. Wait a minute and retry. If persistent, the account may need a billing upgrade.
- **Video generation times out** — This is normal for Veo 3. Generation can take up to 6 minutes during peak usage. Keep polling.
- **Image quality not great** — Add more detail to your prompt. Specify style, lighting, composition, and mood. Try Nano Banana Pro (\`gemini-3-pro-image-preview\` model) for higher quality.
- **Python packages missing** — Install them: \`pip3 install -q google-genai Pillow\`
`;
}

/**
 * Generate a shell wrapper script for image generation via Nano Banana.
 * Installed at /usr/local/bin/generate-image in the container.
 */
export function generateImageScript(): string {
  return `#!/bin/bash
# generate-image — Generate images with Nano Banana (Google Gemini Image API)
# Usage: generate-image "<prompt>" <output-filename> [aspect-ratio]
#
# Examples:
#   generate-image "A sunset over the ocean" sunset.png
#   generate-image "Social media banner" banner.png 16:9

set -euo pipefail

PROMPT="\${1:?Usage: generate-image \\"<prompt>\\" <filename> [aspect-ratio]}"
FILENAME="\${2:?Usage: generate-image \\"<prompt>\\" <filename> [aspect-ratio]}"
ASPECT="\${3:-1:1}"
WORKSPACE="/home/node/.openclaw/workspace-main"
OUTPUT="\${WORKSPACE}/\${FILENAME}"

if [ -z "\${GEMINI_API_KEY:-}" ]; then
  # Try credential manager
  KEY=\$(cred get-raw gemini api_key 2>/dev/null || true)
  if [ -n "\$KEY" ]; then
    export GEMINI_API_KEY="\$KEY"
  else
    echo "Error: GEMINI_API_KEY not set. Ask your manager for a Gemini API key." >&2
    exit 1
  fi
fi

mkdir -p "\$WORKSPACE"

# Call the Gemini API
RESPONSE=\$(curl -s -X POST \\
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image-preview:generateContent" \\
  -H "x-goog-api-key: \${GEMINI_API_KEY}" \\
  -H "Content-Type: application/json" \\
  -d "{
    \\"contents\\": [{\\"parts\\": [{\\"text\\": \\"\${PROMPT}\\"}]}],
    \\"generationConfig\\": {
      \\"responseModalities\\": [\\"IMAGE\\"],
      \\"imageConfig\\": { \\"aspectRatio\\": \\"\${ASPECT}\\" }
    }
  }")

# Extract base64 image data from response
IMAGE_DATA=\$(echo "\$RESPONSE" | python3 -c "
import sys, json, base64
try:
    data = json.load(sys.stdin)
    for candidate in data.get('candidates', []):
        for part in candidate.get('content', {}).get('parts', []):
            if 'inlineData' in part:
                print(part['inlineData']['data'])
                sys.exit(0)
    # Check for error
    if 'error' in data:
        print('ERROR: ' + data['error'].get('message', 'Unknown error'), file=sys.stderr)
        sys.exit(1)
    print('ERROR: No image in response', file=sys.stderr)
    sys.exit(1)
except Exception as e:
    print(f'ERROR: {e}', file=sys.stderr)
    sys.exit(1)
" 2>&1)

if echo "\$IMAGE_DATA" | grep -q "^ERROR:"; then
  echo "\$IMAGE_DATA" >&2
  exit 1
fi

# Decode and save
echo "\$IMAGE_DATA" | base64 -d > "\$OUTPUT"
echo "Image saved: \$OUTPUT"
`;
}

/**
 * Generate a shell wrapper script for video generation via Veo 3.
 * Installed at /usr/local/bin/generate-video in the container.
 */
export function generateVideoScript(): string {
  return `#!/bin/bash
# generate-video — Generate videos with Veo 3 (Google Video Generation API)
# Usage: generate-video "<prompt>" <output-filename> [duration-seconds]
#
# Examples:
#   generate-video "A timelapse of a flower blooming" flower.mp4
#   generate-video "Ocean waves crashing on rocks" waves.mp4 6

set -euo pipefail

PROMPT="\${1:?Usage: generate-video \\"<prompt>\\" <filename> [duration]}"
FILENAME="\${2:?Usage: generate-video \\"<prompt>\\" <filename> [duration]}"
DURATION="\${3:-8}"
WORKSPACE="/home/node/.openclaw/workspace-main"
OUTPUT="\${WORKSPACE}/\${FILENAME}"

if [ -z "\${GEMINI_API_KEY:-}" ]; then
  KEY=\$(cred get-raw gemini api_key 2>/dev/null || true)
  if [ -n "\$KEY" ]; then
    export GEMINI_API_KEY="\$KEY"
  else
    echo "Error: GEMINI_API_KEY not set. Ask your manager for a Gemini API key." >&2
    exit 1
  fi
fi

mkdir -p "\$WORKSPACE"

echo "Starting video generation (this takes 1-3 minutes)..."

# Use Python for the async operation
pip3 install -q google-genai 2>/dev/null

python3 << PYEOF
import os, sys, time

from google import genai
from google.genai.types import GenerateVideosConfig

client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])

try:
    operation = client.models.generate_videos(
        model="veo-3.0-generate-001",
        prompt="""\${PROMPT}""",
        config=GenerateVideosConfig(
            aspect_ratio="16:9",
            number_of_videos=1,
            duration_seconds=\${DURATION},
            generate_audio=True,
        ),
    )

    # Poll until complete (timeout after 6 minutes)
    start = time.time()
    while not operation.done:
        if time.time() - start > 360:
            print("Error: Video generation timed out after 6 minutes.", file=sys.stderr)
            sys.exit(1)
        time.sleep(15)
        operation = client.operations.get(operation)
        elapsed = int(time.time() - start)
        print(f"  Generating... ({elapsed}s elapsed)")

    if operation.response and operation.response.generated_videos:
        video = operation.response.generated_videos[0]
        video_bytes = video.video.video_bytes
        if video_bytes:
            with open("\${OUTPUT}", "wb") as f:
                f.write(video_bytes)
            print(f"Video saved: \${OUTPUT}")
        elif video.video.uri:
            print(f"Video available at: {video.video.uri}")
        else:
            print("Error: No video data in response.", file=sys.stderr)
            sys.exit(1)
    else:
        print("Error: Video generation failed or was filtered by safety checks.", file=sys.stderr)
        sys.exit(1)

except Exception as e:
    print(f"Error: {e}", file=sys.stderr)
    sys.exit(1)
PYEOF
`;
}
