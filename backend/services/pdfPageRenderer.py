"""Isolated PDF-to-image renderer for future local vision-model workflows.

This module intentionally performs no text extraction, OCR, interpretation, or
AI calls. It only renders PDF pages to ordered image files with PyMuPDF.
"""

from __future__ import annotations

import os
import shutil
import tempfile
from pathlib import Path
from typing import BinaryIO, Iterable, Mapping, Sequence

import fitz


class PdfRenderError(RuntimeError):
    """Raised when a PDF cannot be opened or a page cannot be rendered."""


PdfInput = str | os.PathLike[str] | bytes | bytearray | memoryview | BinaryIO


def _read_pdf_input(pdf_path_or_buffer: PdfInput) -> tuple[bytes | str, bool]:
    if isinstance(pdf_path_or_buffer, (bytes, bytearray, memoryview)):
        data = bytes(pdf_path_or_buffer)
        if not data:
            raise PdfRenderError("PDF buffer is empty.")
        return data, True

    if hasattr(pdf_path_or_buffer, "read"):
        data = pdf_path_or_buffer.read()
        if not isinstance(data, (bytes, bytearray, memoryview)) or not data:
            raise PdfRenderError("PDF buffer is empty or cannot be read.")
        return bytes(data), True

    path = Path(pdf_path_or_buffer)
    if not path.exists():
        raise PdfRenderError(f"PDF file does not exist: {path}")
    if not path.is_file():
        raise PdfRenderError(f"PDF path is not a file: {path}")
    try:
        return str(path), False
    except TypeError as error:
        raise PdfRenderError("PDF input must be a path or readable byte buffer.") from error


def _resolve_page_numbers(page_count: int, page_range: Sequence[int] | range | None) -> list[int]:
    if page_range is None:
        return list(range(1, page_count + 1))

    page_numbers = list(page_range)
    if not page_numbers:
        raise PdfRenderError("pageRange must contain at least one page number.")
    if any(not isinstance(page, int) or isinstance(page, bool) for page in page_numbers):
        raise PdfRenderError("pageRange must contain integer page numbers.")
    if any(page < 1 or page > page_count for page in page_numbers):
        raise PdfRenderError(f"pageRange contains a page outside 1-{page_count}.")
    if len(set(page_numbers)) != len(page_numbers):
        raise PdfRenderError("pageRange must not contain duplicate page numbers.")
    return page_numbers


def cleanup_rendered_images(rendered_pages: Iterable[Mapping[str, object]]) -> None:
    """Remove the output directory containing rendered pages.

    Call this after the caller has finished consuming images. Explicit output
    directories are also removed, so callers should dedicate one directory to
    a render operation rather than sharing it with unrelated files.
    """

    directories = {
        str(Path(str(page["imagePath"])).parent)
        for page in rendered_pages
        if page.get("imagePath")
    }
    for directory in directories:
        shutil.rmtree(directory, ignore_errors=True)


def render_pdf_to_images(
    pdf_path_or_buffer: PdfInput,
    options: Mapping[str, object] | None = None,
) -> list[dict[str, object]]:
    """Render ordered PDF pages to PNG/JPEG files.

    Options:
        dpi: Render resolution. Defaults to 144 DPI.
        scale: Optional scale multiplier. If supplied, it takes precedence over dpi.
        imageFormat: ``png`` or ``jpeg``. Defaults to ``png``.
        pageRange: Optional 1-based iterable of page numbers, in desired order.
        outputDirectory: Optional dedicated directory for rendered images.

    The returned page dictionaries contain ``pageNumber``, ``imagePath``,
    ``width``, and ``height``. No artificial page-count limit is applied.
    """

    config = dict(options or {})
    image_format = str(config.get("imageFormat", "png")).lower().lstrip(".")
    if image_format not in {"png", "jpeg"}:
        raise PdfRenderError("imageFormat must be 'png' or 'jpeg'.")

    try:
        scale = float(config["scale"]) if config.get("scale") is not None else None
        dpi = float(config.get("dpi", 144))
    except (TypeError, ValueError) as error:
        raise PdfRenderError("dpi and scale must be positive numbers.") from error
    if scale is not None and scale <= 0:
        raise PdfRenderError("scale must be greater than zero.")
    if scale is None and dpi <= 0:
        raise PdfRenderError("dpi must be greater than zero.")

    source, is_buffer = _read_pdf_input(pdf_path_or_buffer)
    output_directory = config.get("outputDirectory")
    created_directory = output_directory is None
    output_path = Path(output_directory) if output_directory else Path(tempfile.mkdtemp(prefix="pdf-render-"))
    output_path.mkdir(parents=True, exist_ok=True)

    document = None
    rendered_pages: list[dict[str, object]] = []
    try:
        try:
            document = fitz.open(stream=source, filetype="pdf") if is_buffer else fitz.open(source)
        except Exception as error:
            raise PdfRenderError(f"PDF cannot be opened: {error}") from error

        page_numbers = _resolve_page_numbers(document.page_count, config.get("pageRange"))
        matrix = fitz.Matrix(scale, scale) if scale is not None else fitz.Matrix(dpi / 72, dpi / 72)
        extension = "jpg" if image_format == "jpeg" else "png"

        for page_number in page_numbers:
            try:
                page = document.load_page(page_number - 1)
                pixmap = page.get_pixmap(matrix=matrix, alpha=False)
                image_path = output_path / f"page-{page_number:04d}.{extension}"
                pixmap.save(str(image_path))
                rendered_pages.append({
                    "pageNumber": page_number,
                    "imagePath": str(image_path),
                    "width": pixmap.width,
                    "height": pixmap.height,
                })
            except Exception as error:
                raise PdfRenderError(f"Page {page_number} failed to render: {error}") from error

        return rendered_pages
    except Exception:
        if created_directory or output_directory:
            shutil.rmtree(output_path, ignore_errors=True)
        raise
    finally:
        if document is not None:
            document.close()


renderPdfToImages = render_pdf_to_images


if __name__ == "__main__":
    import argparse
    import json

    parser = argparse.ArgumentParser(description="Render PDF pages to ordered images.")
    parser.add_argument("pdf", help="Path to a PDF file")
    parser.add_argument("--dpi", type=float, default=144)
    parser.add_argument("--image-format", default="png", choices=("png", "jpeg"))
    parser.add_argument("--output-directory")
    args = parser.parse_args()
    print(json.dumps(render_pdf_to_images(args.pdf, {
        "dpi": args.dpi,
        "imageFormat": args.image_format,
        "outputDirectory": args.output_directory,
    }), indent=2))