"""Tests for Circuit Breaker functionality in ProcessExecutor."""

import time

from rpaforge.core.execution import ActivityCall
from rpaforge.core.executor import CircuitState, ProcessExecutor


class TestCircuitBreaker:
    """Tests for circuit breaker pattern implementation."""

    def test_circuit_breaker_initially_closed(self):
        """Circuit breaker should start in CLOSED state."""
        executor = ProcessExecutor()
        activity = ActivityCall(library="TestLib", activity="test_activity", args=())
        allowed, status = executor._check_circuit_breaker(activity)
        assert allowed is True
        assert status is None
        circuit_key = executor._get_circuit_key(activity)
        assert circuit_key not in executor._circuit_breakers

    def test_consecutive_failures_open_circuit(self):
        """After 3 consecutive failures, circuit should OPEN."""
        executor = ProcessExecutor()
        activity = ActivityCall(library="TestLib", activity="failing_activity", args=())
        for _ in range(3):
            executor._update_circuit_breaker(activity, success=False)
        circuit_key = executor._get_circuit_key(activity)
        state = executor._circuit_breakers[circuit_key]
        assert state.state == CircuitState.OPEN
        assert state.failures == 3
        allowed, status = executor._check_circuit_breaker(activity)
        assert allowed is False
        assert "OPEN" in status

    def test_success_resets_failures_in_closed_state(self):
        """Successful execution should reset failure counter in CLOSED state."""
        executor = ProcessExecutor()
        activity = ActivityCall(library="TestLib", activity="flaky_activity", args=())
        executor._update_circuit_breaker(activity, success=False)
        executor._update_circuit_breaker(activity, success=False)
        circuit_key = executor._get_circuit_key(activity)
        state = executor._circuit_breakers[circuit_key]
        assert state.failures == 2
        executor._update_circuit_breaker(activity, success=True)
        assert state.failures == 0
        assert state.state == CircuitState.CLOSED

    def test_half_open_state_after_timeout(self):
        """After 60 seconds in OPEN state, circuit should transition to HALF_OPEN."""
        executor = ProcessExecutor()
        activity = ActivityCall(
            library="TestLib", activity="recovering_activity", args=()
        )
        for _ in range(3):
            executor._update_circuit_breaker(activity, success=False)
        circuit_key = executor._get_circuit_key(activity)
        state = executor._circuit_breakers[circuit_key]
        state.state_changed_at = time.time() - 60.0
        allowed, status = executor._check_circuit_breaker(activity)
        assert allowed is True
        assert "HALF_OPEN" in status
        assert state.state == CircuitState.HALF_OPEN

    def test_success_in_half_open_closes_circuit(self):
        """Success in HALF_OPEN state should close the circuit."""
        executor = ProcessExecutor()
        activity = ActivityCall(
            library="TestLib", activity="recovery_activity", args=()
        )
        for _ in range(3):
            executor._update_circuit_breaker(activity, success=False)
        circuit_key = executor._get_circuit_key(activity)
        state = executor._circuit_breakers[circuit_key]
        state.state = CircuitState.HALF_OPEN
        executor._update_circuit_breaker(activity, success=True)
        assert state.state == CircuitState.CLOSED
        assert state.failures == 0

    def test_failure_in_half_open_reopens_circuit(self):
        """Failure in HALF_OPEN state should reopen the circuit."""
        executor = ProcessExecutor()
        activity = ActivityCall(
            library="TestLib", activity="failing_recovery_activity", args=()
        )
        for _ in range(3):
            executor._update_circuit_breaker(activity, success=False)
        circuit_key = executor._get_circuit_key(activity)
        state = executor._circuit_breakers[circuit_key]
        state.state = CircuitState.HALF_OPEN
        executor._update_circuit_breaker(activity, success=False)
        assert state.state == CircuitState.OPEN

    def test_circuit_breaker_isolation_per_activity(self):
        """Circuit breakers should be isolated per activity."""
        executor = ProcessExecutor()
        activity1 = ActivityCall(library="Lib1", activity="act1", args=())
        activity2 = ActivityCall(library="Lib2", activity="act2", args=())
        executor._update_circuit_breaker(activity1, success=False)
        executor._update_circuit_breaker(activity1, success=False)
        executor._update_circuit_breaker(activity1, success=False)
        executor._update_circuit_breaker(activity2, success=False)
        state1 = executor._circuit_breakers[executor._get_circuit_key(activity1)]
        state2 = executor._circuit_breakers[executor._get_circuit_key(activity2)]
        assert state1.state == CircuitState.OPEN
        assert state1.failures == 3
        assert state2.state == CircuitState.CLOSED
        assert state2.failures == 1

    def test_no_circuit_breaker_for_nonexistent_activity(self):
        """Activities without circuit breaker state should be allowed."""
        executor = ProcessExecutor()
        activity = ActivityCall(library="NonExistent", activity="missing", args=())
        allowed, status = executor._check_circuit_breaker(activity)
        assert allowed is True
        assert status is None
