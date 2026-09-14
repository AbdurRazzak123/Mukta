def get_remote_image(
    url: str,
    news_id: str,
    image_number: int,
    assets_dir: Path,
    session: requests.Session | None = None,
) -> str:
    """
    Downloads an image and returns a ROOT-relative path.

    Example:
        assets/news/25-1.jpg
    """

    url = clean_text(url)

    if not url:
        return ""

    if not url.startswith(("http://", "https://")):
        return ""

    session = session or requests.Session()

    headers = {
        "User-Agent": USER_AGENT,
        "Accept": (
            "image/avif,image/webp,image/apng,"
            "image/svg+xml,image/*,*/*;q=0.8"
        ),
    }

    try:
        response = session.get(
            url,
            headers=headers,
            timeout=TIMEOUT,
            stream=True,
            allow_redirects=True,
        )

        response.raise_for_status()

        content_type = response.headers.get(
            "content-type",
            ""
        ).lower()

        # HTML page যেন ভুল করে image হিসেবে save না হয়
        if content_type and not content_type.startswith("image/"):
            response.close()
            return ""

        extension = image_extension(
            url,
            content_type,
        )

        filename = make_asset_filename(
            news_id,
            image_number,
            extension,
        )

        destination = assets_dir / filename
        destination.parent.mkdir(
            parents=True,
            exist_ok=True,
        )

        # আগে থেকেই থাকলে আবার download করবে না
        if (
            destination.exists()
            and destination.stat().st_size > 0
        ):
            response.close()
            return f"assets/news/{filename}"

        temporary = destination.with_suffix(
            destination.suffix + ".tmp"
        )

        try:
            with open(temporary, "wb") as output:
                for chunk in response.iter_content(
                    chunk_size=1024 * 64
                ):
                    if chunk:
                        output.write(chunk)
        finally:
            response.close()

        if (
            not temporary.exists()
            or temporary.stat().st_size == 0
        ):
            try:
                temporary.unlink()
            except Exception:
                pass

            return ""

        temporary.replace(destination)

        # সবসময় root-relative path return করবে
        return f"assets/news/{filename}"

    except Exception:
        return ""
