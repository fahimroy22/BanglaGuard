from pathlib import Path
from secrets import token_urlsafe
from typing import ClassVar

from fastapi import UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import ROOT_DIR, settings
from app.db.models import User


class AvatarValidationError(Exception):
    pass


class AvatarNotFoundError(Exception):
    pass


class ProfileAvatarService:
    ALLOWED_CONTENT_TYPES: ClassVar[dict[str, str]] = {
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp",
    }

    def __init__(
        self,
        session: AsyncSession | None,
    ) -> None:
        self.session = session

        self.avatar_root = (
            ROOT_DIR / settings.upload_storage_path / "avatars"
        ).resolve()

        self.avatar_root.mkdir(
            parents=True,
            exist_ok=True,
        )

    async def upload(
        self,
        *,
        user: User,
        file: UploadFile,
    ) -> Path:
        content_type = (file.content_type or "").lower()

        extension = self.ALLOWED_CONTENT_TYPES.get(content_type)

        if extension is None:
            raise AvatarValidationError(
                "Profile picture must be a JPEG, PNG, or WebP image."
            )

        content = await file.read(settings.profile_avatar_max_bytes + 1)

        if not content:
            raise AvatarValidationError("Profile picture cannot be empty.")

        if len(content) > settings.profile_avatar_max_bytes:
            raise AvatarValidationError("Profile picture exceeds the 5 MB size limit.")

        detected_extension = self._detect_image_type(content)

        if detected_extension is None:
            raise AvatarValidationError(
                "Uploaded file is not a valid JPEG, PNG, or WebP image."
            )

        if detected_extension != extension:
            raise AvatarValidationError(
                "Uploaded image content does not match its media type."
            )

        user_directory = (self.avatar_root / str(user.id)).resolve()

        self._ensure_within_avatar_root(user_directory)

        user_directory.mkdir(
            parents=True,
            exist_ok=True,
        )

        filename = f"avatar-{token_urlsafe(18)}" f"{detected_extension}"

        destination = (user_directory / filename).resolve()

        self._ensure_within_avatar_root(destination)

        temporary_path = (user_directory / f".{filename}.tmp").resolve()

        self._ensure_within_avatar_root(temporary_path)

        previous_path = self._resolve_stored_path(user.avatar_path)

        if self.session is None:
            raise RuntimeError(
                "A database session is required to upload a profile picture."
            )

        try:
            temporary_path.write_bytes(content)

            temporary_path.replace(destination)

            relative_path = destination.relative_to(ROOT_DIR.resolve())

            user.avatar_path = str(relative_path)

            await self.session.commit()
            await self.session.refresh(user)

        except Exception:
            if temporary_path.exists():
                temporary_path.unlink(missing_ok=True)

            if destination.exists():
                destination.unlink(missing_ok=True)

            await self.session.rollback()
            raise

        if (
            previous_path is not None
            and previous_path != destination
            and previous_path.is_file()
        ):
            previous_path.unlink(missing_ok=True)

        self._remove_empty_parent(previous_path)

        return destination

    def get_avatar_path(
        self,
        *,
        user: User,
    ) -> Path:
        path = self._resolve_stored_path(user.avatar_path)

        if path is None or not path.exists() or not path.is_file():
            raise AvatarNotFoundError

        return path

    async def remove(
        self,
        *,
        user: User,
    ) -> None:
        if self.session is None:
            raise RuntimeError(
                "A database session is required to remove a profile picture."
            )

        existing_path = self._resolve_stored_path(user.avatar_path)

        user.avatar_path = None

        try:
            await self.session.commit()
            await self.session.refresh(user)

        except Exception:
            await self.session.rollback()
            raise

        if existing_path is not None and existing_path.is_file():
            existing_path.unlink(missing_ok=True)

        self._remove_empty_parent(existing_path)

    def _resolve_stored_path(
        self,
        stored_path: str | None,
    ) -> Path | None:
        if not stored_path:
            return None

        candidate = Path(stored_path)

        if not candidate.is_absolute():
            candidate = ROOT_DIR / candidate

        resolved = candidate.resolve()

        self._ensure_within_avatar_root(resolved)

        return resolved

    def _ensure_within_avatar_root(
        self,
        path: Path,
    ) -> None:
        try:
            path.relative_to(self.avatar_root)

        except ValueError as exc:
            raise AvatarValidationError(
                "Invalid profile picture storage path."
            ) from exc

    def _remove_empty_parent(
        self,
        path: Path | None,
    ) -> None:
        if path is None:
            return

        parent = path.parent

        if parent == self.avatar_root:
            return

        try:
            parent.relative_to(self.avatar_root)

        except ValueError:
            return

        try:
            parent.rmdir()

        except OSError:
            pass

    @staticmethod
    def _detect_image_type(
        content: bytes,
    ) -> str | None:
        if content.startswith(b"\xff\xd8\xff"):
            return ".jpg"

        if content.startswith(b"\x89PNG\r\n\x1a\n"):
            return ".png"

        if len(content) >= 12 and content[:4] == b"RIFF" and content[8:12] == b"WEBP":
            return ".webp"

        return None


def avatar_media_type(
    path: Path,
) -> str:
    suffix = path.suffix.lower()

    media_types = {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".webp": "image/webp",
    }

    media_type = media_types.get(suffix)

    if media_type is None:
        raise AvatarValidationError("Unsupported stored profile picture format.")

    return media_type
