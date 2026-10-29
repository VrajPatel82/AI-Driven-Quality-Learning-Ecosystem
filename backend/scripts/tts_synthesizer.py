import sys
import json
import os
import asyncio
import re
import subprocess
import edge_tts
import imageio_ffmpeg

VOICE_MAP = {
    "English": "en-IN-NeerjaNeural",
    "Hindi": "hi-IN-MadhurNeural",
    "Gujarati": "gu-IN-NiranjanNeural"
}

def clean_narrative_text(text):
    """
    Strips SSML, HTML tags, markdown, URLs, metadata, segment IDs, and JSON artifacts.
    Returns clean, natural spoken lecture text.
    """
    if not text:
        return ""
    # Strip <think> reasoning tags
    text = re.sub(r'<think>[\s\S]*?<\/think>', ' ', text, flags=re.IGNORECASE)
    # Strip HTML/SSML tags
    text = re.sub(r'<[^>]+>', ' ', text)
    # Strip Markdown code blocks/bold/italics
    text = re.sub(r'[*_#`~]', '', text)
    # Strip URLs / www links
    text = re.sub(r'https?://\S+|www\.\S+', '', text, flags=re.IGNORECASE)
    # Strip segment IDs or numbers like "1. ", "Segment 1:"
    text = re.sub(r'^\s*(Segment\s*\d+:?|\d+\.|\d+\))\s*', '', text, flags=re.IGNORECASE)
    # Strip notes / reasoning prefixes
    text = re.sub(r'^\s*(Note|Translation|Here is the translation):?\s*', '', text, flags=re.IGNORECASE)
    # Normalize multiple whitespace
    text = re.sub(r'\s+', ' ', text).strip()
    return text

async def generate_chunk_audio(text, voice, output_path, retries=3):
    """
    Synthesize clean continuous narration text into an audio file using Edge TTS with retry logic.
    """
    clean_text = clean_narrative_text(text)
    if not clean_text:
        return False

    for attempt in range(retries):
        try:
            communicate = edge_tts.Communicate(clean_text, voice)
            await communicate.save(output_path)
            if os.path.exists(output_path) and os.path.getsize(output_path) > 0:
                return True
        except Exception as e:
            print(f"[Warning] Edge TTS attempt {attempt + 1}/{retries} failed: {e}", file=sys.stderr)
            await asyncio.sleep(1.0)

    # Fallback to English voice if target language voice fails
    if voice != "en-IN-NeerjaNeural":
        try:
            print(f"[Fallback] Retrying chunk with fallback English voice...", file=sys.stderr)
            communicate = edge_tts.Communicate(clean_text, "en-IN-NeerjaNeural")
            await communicate.save(output_path)
            if os.path.exists(output_path) and os.path.getsize(output_path) > 0:
                return True
        except Exception as e:
            print(f"[Fallback Error] {e}", file=sys.stderr)

    return False

def get_audio_duration(file_path):
    """
    Get exact audio duration in seconds using FFmpeg.
    """
    if not os.path.exists(file_path) or os.path.getsize(file_path) == 0:
        return 0.0
    ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
    cmd = [ffmpeg_exe, "-i", file_path]
    res = subprocess.run(cmd, capture_output=True, text=True)
    match = re.search(r"Duration:\s*(\d+):(\d+):(\d+\.\d+)", res.stderr)
    if match:
        return float(match.group(1))*3600 + float(match.group(2))*60 + float(match.group(3))
    return 0.0

def create_silence_audio(duration_sec, output_path):
    """
    Generate a 44.1kHz stereo silence MP3 file using FFmpeg.
    """
    ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
    cmd = [
        ffmpeg_exe, "-y",
        "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo",
        "-t", f"{duration_sec:.3f}",
        "-c:a", "libmp3lame", "-b:a", "128k",
        "-ar", "44100", "-ac", "2",
        output_path
    ]
    res = subprocess.run(cmd, capture_output=True, text=True)
    return os.path.exists(output_path) and os.path.getsize(output_path) > 0

import shutil

def apply_intelligent_tempo(input_file, output_file, tempo_ratio):
    """
    Apply a natural FFmpeg tempo adjustment without pitch alteration.
    Clamped between 0.90x and 1.40x for natural voice quality.
    """
    ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
    tempo = max(0.90, min(1.40, float(tempo_ratio)))

    if tempo > 2.0:
        filter_str = f"atempo=2.0,atempo={tempo / 2.0:.3f}"
    elif tempo < 0.5:
        filter_str = f"atempo=0.5,atempo={tempo / 0.5:.3f}"
    else:
        filter_str = f"atempo={tempo:.3f}"

    cmd = [
        ffmpeg_exe, "-y",
        "-i", input_file,
        "-filter:a", filter_str,
        "-c:a", "libmp3lame", "-b:a", "128k",
        "-ar", "44100", "-ac", "2",
        output_file
    ]
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode == 0 and os.path.exists(output_file) and os.path.getsize(output_file) > 0:
        return output_file
    return input_file

def trim_audio_to_duration(input_file, output_file, target_duration_sec):
    """
    Trim audio file to exact target duration using FFmpeg.
    """
    ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
    cmd = [
        ffmpeg_exe, "-y",
        "-i", input_file,
        "-to", f"{target_duration_sec:.3f}",
        "-c:a", "libmp3lame", "-b:a", "128k",
        "-ar", "44100", "-ac", "2",
        output_file
    ]
    res = subprocess.run(cmd, capture_output=True, text=True)
    return res.returncode == 0 and os.path.exists(output_file) and os.path.getsize(output_file) > 0

def concatenate_chunks_with_ffmpeg(chunk_files, final_mp3_path):
    """
    Use FFmpeg to re-encode and concatenate audio chunks cleanly into a single 44.1kHz stereo MP3.
    Eliminates pops, clicks, abrupt cuts, and MP3 header corruption.
    """
    ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
    concat_list_path = f"{final_mp3_path}_list.txt"

    with open(concat_list_path, 'w', encoding='utf-8') as f:
        for cf in chunk_files:
            escaped_cf = cf.replace('\\', '/')
            f.write(f"file '{escaped_cf}'\n")

    cmd = [
        ffmpeg_exe,
        "-y",
        "-f", "concat",
        "-safe", "0",
        "-i", concat_list_path,
        "-c:a", "libmp3lame",
        "-b:a", "128k",
        "-ar", "44100",
        "-ac", "2",
        final_mp3_path
    ]

    res = subprocess.run(cmd, capture_output=True, text=True)

    if os.path.exists(concat_list_path):
        try: os.remove(concat_list_path)
        except Exception: pass

    if res.returncode != 0 or not os.path.exists(final_mp3_path) or os.path.getsize(final_mp3_path) == 0:
        raise RuntimeError(f"FFmpeg concatenation failed: {res.stderr}")

    return os.path.getsize(final_mp3_path)

async def process_tts(input_json_path, output_mp3_path, target_language, master_duration_arg=0.0):
    if not os.path.exists(input_json_path):
        raise FileNotFoundError(f"Input file not found: {input_json_path}")

    with open(input_json_path, 'r', encoding='utf-8') as f:
        input_data = json.load(f)

    voice = VOICE_MAP.get(target_language, "en-IN-NeerjaNeural")

    # Support either payload object { masterDuration, chunks } or direct array of chunks
    master_duration = master_duration_arg
    if isinstance(input_data, dict):
        chunks = input_data.get('chunks', [])
        if master_duration <= 0.0:
            master_duration = float(input_data.get('masterDuration', 0.0))
    elif isinstance(input_data, list):
        chunks = input_data

    output_dir = os.path.dirname(output_mp3_path)
    if output_dir and not os.path.exists(output_dir):
        os.makedirs(output_dir, exist_ok=True)

    temp_files = []
    aligned_audio_sequence = []
    current_timeline_time = 0.0

    # Filter chunks with valid text
    valid_chunks = []
    for item in chunks:
        text = item.get('text') or item.get('translatedText') or ''
        clean_text = clean_narrative_text(text)
        if clean_text:
            valid_chunks.append((item, clean_text))

    try:
        for idx, (item, clean_text) in enumerate(valid_chunks):
            source_start = float(item.get('sourceStart', current_timeline_time))
            source_end = float(item.get('sourceEnd', source_start + 10.0))

            # Determine next chunk's sourceStart for strict overlap protection
            next_start = source_end
            if idx + 1 < len(valid_chunks):
                next_item = valid_chunks[idx + 1][0]
                next_start = float(next_item.get('sourceStart', source_end))

            available_window = max(1.0, next_start - source_start)

            # 1. Timeline Alignment: Insert silence gap if source_start > current_timeline_time
            if source_start > current_timeline_time + 0.05:
                silence_gap = source_start - current_timeline_time
                silence_file = f"{output_mp3_path}_silence_pre_{idx}.mp3"
                temp_files.append(silence_file)
                if create_silence_audio(silence_gap, silence_file):
                    aligned_audio_sequence.append(silence_file)
                    current_timeline_time += silence_gap

            # 2. Synthesize chunk audio with Edge TTS
            chunk_file = f"{output_mp3_path}_chunk_{idx}.mp3"
            temp_files.append(chunk_file)

            success = await generate_chunk_audio(clean_text, voice, chunk_file)
            if not success:
                print(f"[Warning] Failed to generate TTS for chunk {idx}", file=sys.stderr)
                continue

            spoken_dur = get_audio_duration(chunk_file)

            # 3. Intelligent Duration Fitting & Overlap Protection
            final_chunk_file = chunk_file
            if available_window > 1.0 and spoken_dur > available_window + 0.1:
                overflow_ratio = spoken_dur / available_window
                if overflow_ratio > 1.02:
                    tempo_file = f"{output_mp3_path}_tempo_{idx}.mp3"
                    temp_files.append(tempo_file)
                    final_chunk_file = apply_intelligent_tempo(chunk_file, tempo_file, overflow_ratio)
                    fitted_dur = get_audio_duration(final_chunk_file)
                    print(f"[TimelineFit] Chunk {idx+1}/{len(valid_chunks)}: spoken {spoken_dur:.2f}s > window {available_window:.2f}s -> atempo {overflow_ratio:.2f}x (Fitted: {fitted_dur:.2f}s)", file=sys.stderr)

            actual_chunk_dur = get_audio_duration(final_chunk_file)
            aligned_audio_sequence.append(final_chunk_file)
            current_timeline_time += actual_chunk_dur

        if not aligned_audio_sequence:
            raise ValueError("TTS generation produced 0 valid audio chunks")

        # 4. Assembly & Initial Concatenation
        concat_raw_path = f"{output_mp3_path}_concat_raw.mp3"
        temp_files.append(concat_raw_path)
        size_bytes = concatenate_chunks_with_ffmpeg(aligned_audio_sequence, concat_raw_path)
        raw_total_dur = get_audio_duration(concat_raw_path)

        # Infer master duration from last chunk end if not explicitly provided
        if master_duration <= 0.0 and valid_chunks:
            master_duration = float(valid_chunks[-1][0].get('sourceEnd', raw_total_dur))

        # 5. End-of-Track Master Timeline Alignment
        if master_duration > 0.0:
            dur_diff = master_duration - raw_total_dur
            print(f"[MasterTimeline] Assembly Dur: {raw_total_dur:.2f}s | Target Master Dur: {master_duration:.2f}s | Diff: {dur_diff:+.2f}s", file=sys.stderr)

            if dur_diff > 0.3:
                # Trailing silence padding to reach master_duration exactly
                trailing_silence_file = f"{output_mp3_path}_trail_silence.mp3"
                temp_files.append(trailing_silence_file)
                if create_silence_audio(dur_diff, trailing_silence_file):
                    size_bytes = concatenate_chunks_with_ffmpeg([concat_raw_path, trailing_silence_file], output_mp3_path)
                else:
                    shutil.copyfile(concat_raw_path, output_mp3_path)
            elif dur_diff < -0.3:
                # Trim small excess to match master_duration exactly
                trim_audio_to_duration(concat_raw_path, output_mp3_path, master_duration)
                size_bytes = os.path.getsize(output_mp3_path) if os.path.exists(output_mp3_path) else size_bytes
            else:
                shutil.copyfile(concat_raw_path, output_mp3_path)
        else:
            shutil.copyfile(concat_raw_path, output_mp3_path)

        final_track_duration = get_audio_duration(output_mp3_path)
        print(f"[MasterTimeline] ✅ Final Output Audio Duration: {final_track_duration:.2f}s (Master Target: {master_duration:.2f}s)", file=sys.stderr)

        print(json.dumps({
            "status": "success",
            "output_path": output_mp3_path,
            "size_bytes": size_bytes,
            "duration": final_track_duration,
            "master_duration": master_duration,
            "chunks_processed": len(aligned_audio_sequence)
        }))
    finally:
        for tf in temp_files:
            if os.path.exists(tf):
                try: os.remove(tf)
                except Exception: pass

if __name__ == "__main__":
    if len(sys.argv) < 4:
        print("Usage: python tts_synthesizer.py <input_json_path> <output_mp3_path> <target_language> [master_duration]")
        sys.exit(1)

    input_json = sys.argv[1]
    output_mp3 = sys.argv[2]
    language = sys.argv[3]
    master_dur = float(sys.argv[4]) if len(sys.argv) > 4 else 0.0

    asyncio.run(process_tts(input_json, output_mp3, language, master_dur))
