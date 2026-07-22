import torch

from app.ml.transformer_model import (
    get_torch_device,
    resolve_transformer_path,
)


def test_transformer_path_resolution() -> None:
    resolved = resolve_transformer_path(
        "storage/models/example"
    )

    assert resolved.is_absolute()


def test_torch_device_is_supported() -> None:
    device = get_torch_device()

    assert isinstance(device, torch.device)

    assert device.type in {
        "cpu",
        "cuda",
        "mps",
    }