"""Smart Selector Engine - Multi-strategy resolution pipeline with self-healing."""

from __future__ import annotations

import logging
import time
import warnings
from collections.abc import Callable
from typing import Any

from rpaforge.selectors.models import (
    CompositeSelector,
    SelectorHealedWarning,
    SelectorResolutionResult,
    SelectorStrategy,
    SelectorStrategyType,
)
from rpaforge.selectors.parser import parse_selector

logger = logging.getLogger("rpaforge.selectors.engine")


class SmartSelectorEngine:
    """Multi-strategy selector resolution engine with hierarchical fallback & self-healing."""

    def __init__(
        self,
        default_timeout_ms: int = 10000,
        fast_probe_timeout_ms: int = 1500,
        confidence_threshold: float = 0.70,
        enable_healing_warnings: bool = True,
    ) -> None:
        self.default_timeout_ms = default_timeout_ms
        self.fast_probe_timeout_ms = fast_probe_timeout_ms
        self.confidence_threshold = confidence_threshold
        self.enable_healing_warnings = enable_healing_warnings

    def resolve(
        self,
        selector_query: str | dict[str, Any] | CompositeSelector,
        resolvers: dict[str | SelectorStrategyType, Callable[[SelectorStrategy], Any]],
        timeout_ms: int | None = None,
    ) -> SelectorResolutionResult:
        """Resolve a composite selector using registered strategy resolver callables.

        :param selector_query: Plain selector string or composite descriptor.
        :param resolvers: Mapping from strategy type to resolution function `func(strategy) -> element`.
        :param timeout_ms: Optional total resolution timeout in ms.
        :returns: SelectorResolutionResult containing resolved element and healing metadata.
        :raises TimeoutError: If no strategy could locate the element within the timeout.
        """
        composite = parse_selector(selector_query)
        total_timeout = timeout_ms or composite.timeout_ms or self.default_timeout_ms
        deadline = time.monotonic() + (total_timeout / 1000.0)

        start_time = time.monotonic()
        last_error: Exception | None = None

        if not composite.strategies:
            raise ValueError(
                f"No valid strategies defined in selector: {selector_query}"
            )

        # Strategies sorted by weight descending
        ordered_strategies = sorted(
            composite.strategies, key=lambda s: s.weight, reverse=True
        )
        primary_strategy = ordered_strategies[0]

        for index, strategy in enumerate(ordered_strategies):
            if time.monotonic() > deadline:
                break

            strat_type = (
                strategy.type.value
                if hasattr(strategy.type, "value")
                else str(strategy.type).lower()
            )

            resolver_func = (
                resolvers.get(strat_type)
                or resolvers.get(strategy.type)
                or resolvers.get("default")
            )
            if not resolver_func:
                logger.debug(f"No resolver registered for strategy type '{strat_type}'")
                continue

            try:
                elem = resolver_func(strategy)
                if elem is not None:
                    elapsed_ms = (time.monotonic() - start_time) * 1000.0
                    is_healed = index > 0
                    confidence = strategy.weight

                    discovered_selector = self._format_discovered_selector(strategy)

                    if is_healed:
                        warn_msg = (
                            f"SelectorHealedWarning: Target element located using fallback strategy '{strat_type}' "
                            f"(confidence: {confidence:.2f}) instead of primary '{primary_strategy.type}'. "
                            f"Discovered locator: {discovered_selector}"
                        )
                        if self.enable_healing_warnings:
                            warnings.warn(warn_msg, SelectorHealedWarning, stacklevel=2)
                        logger.warning(warn_msg)

                    return SelectorResolutionResult(
                        element=elem,
                        strategy_used=strategy,
                        confidence_score=confidence,
                        healed=is_healed,
                        discovered_selector=discovered_selector,
                        execution_time_ms=elapsed_ms,
                    )
            except Exception as exc:
                last_error = exc
                logger.debug(
                    f"Strategy '{strat_type}' failed with error: {exc}", exc_info=True
                )

        elapsed_ms = (time.monotonic() - start_time) * 1000.0
        err_msg = (
            f"Element '{composite.original_query or selector_query}' could not be resolved by any of "
            f"{len(ordered_strategies)} strategies within {total_timeout}ms (took {elapsed_ms:.0f}ms)."
        )
        if last_error:
            raise TimeoutError(err_msg) from last_error
        raise TimeoutError(err_msg)

    def _format_discovered_selector(self, strategy: SelectorStrategy) -> str:
        """Format a clean string representation of a successful fallback selector."""
        strat_type = (
            strategy.type.value
            if hasattr(strategy.type, "value")
            else str(strategy.type)
        )
        if strategy.selector:
            return f"{strat_type}:{strategy.selector}"
        if strategy.label:
            dir_str = (
                strategy.direction.value
                if hasattr(strategy.direction, "value")
                else str(strategy.direction)
            )
            return f"anchor:{strategy.label}:{dir_str}"
        if strategy.image_hash:
            return f"visual:{strategy.image_hash}"
        if strategy.type == "vlm_grounding" or (
            hasattr(strategy.type, "value") and strategy.type.value == "vlm_grounding"
        ):
            return (
                f"vlm_grounding:{strategy.label or ''}@{strategy.selector or 'bbox=?'}"
            )
        return f"{strat_type}"
