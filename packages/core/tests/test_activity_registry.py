"""Tests for Activity Registry and bridge payload contract."""


from rpaforge.engine.activity_registry import (
    discover_all_libraries,
    get_registry_stats,
)
from rpaforge.sdk import (
    ActivityMeta,
    ActivityType,
    Param,
    ParamType,
    Port,
    PortType,
    get_activity,
    list_activities,
    list_categories,
)


class TestActivityRegistry:
    """Tests for activity auto-discovery."""

    def test_discover_libraries(self):
        """Test that libraries are discovered."""
        discovered = discover_all_libraries()

        assert "DesktopUI" in discovered
        assert "WebUI" in discovered

    def test_activities_registered(self):
        """Test that activities are registered."""
        activities = list_activities()

        assert len(activities) > 0

    def test_activity_has_required_fields(self):
        """Test that each activity has required fields."""
        activities = list_activities()

        for activity in activities:
            assert activity.id
            assert activity.name
            assert activity.type
            assert activity.category

    def test_activity_to_dict_has_contract_fields(self):
        """Test that to_dict produces the expected contract."""
        activities = list_activities()

        for activity in activities:
            d = activity.to_dict()

            assert "id" in d
            assert "name" in d
            assert "type" in d
            assert "category" in d
            assert "description" in d
            assert "icon" in d
            assert "ports" in d
            assert "inputs" in d["ports"]
            assert "outputs" in d["ports"]
            assert "params" in d
            assert "builtin" in d
            assert "timeout" in d["builtin"]
            assert "robotFramework" in d
            assert "keyword" in d["robotFramework"]
            assert "library" in d["robotFramework"]


class TestBridgePayloadContract:
    """Tests for bridge payload format."""

    def test_params_structure(self):
        """Test params have correct structure."""
        param = Param(
            name="selector",
            type=ParamType.STRING,
            label="CSS Selector",
            description="Element selector",
            required=True,
        )

        d = param.to_dict()

        assert d["name"] == "selector"
        assert d["type"] == "string"
        assert d["label"] == "CSS Selector"
        assert d["description"] == "Element selector"
        assert d["required"] is True
        assert d["default"] is None

    def test_ports_structure(self):
        """Test ports have correct structure."""
        port = Port(
            id="input",
            type=PortType.FLOW,
            label="Input",
            required=True,
        )

        d = port.to_dict()

        assert d["id"] == "input"
        assert d["type"] == "flow"
        assert d["label"] == "Input"
        assert d["required"] is True

    def test_builtin_structure(self):
        """Test builtin settings structure."""
        activity = ActivityMeta(
            id="test.activity",
            name="Test Activity",
            type=ActivityType.SYNC,
            category="Test",
            has_timeout=True,
            has_retry=True,
            has_continue_on_error=True,
        )

        d = activity.to_dict()

        assert d["builtin"]["timeout"] is True
        assert d["builtin"]["retry"] is True
        assert d["builtin"]["continueOnError"] is True

    def test_robot_framework_metadata(self):
        """Test Robot Framework metadata structure."""
        activity = ActivityMeta(
            id="test.click",
            name="Click Element",
            type=ActivityType.SYNC,
            category="Desktop",
            rf_keyword="Click Element",
            rf_library="RPAForge.DesktopUI",
        )

        d = activity.to_dict()

        assert d["robotFramework"]["keyword"] == "Click Element"
        assert d["robotFramework"]["library"] == "RPAForge.DesktopUI"


class TestCategoryFiltering:
    """Tests for category filtering."""

    def test_list_by_category(self):
        """Test filtering activities by category."""
        discover_all_libraries()

        desktop_activities = list_activities(category="Desktop")
        web_activities = list_activities(category="Web")

        for a in desktop_activities:
            assert a.category == "Desktop"

        for a in web_activities:
            assert a.category == "Web"

    def test_list_categories(self):
        """Test listing all categories."""
        discover_all_libraries()

        categories = list_categories()

        assert "BuiltIn" in categories
        assert "Desktop" in categories
        assert "Web" in categories


class TestRegistryStats:
    """Tests for registry statistics."""

    def test_stats_structure(self):
        """Test stats have correct structure."""
        discover_all_libraries()
        stats = get_registry_stats()

        assert "total" in stats
        assert "categories" in stats
        assert "types" in stats
        assert "libraries" in stats

    def test_stats_counts(self):
        """Test stats counts are correct."""
        discover_all_libraries()
        stats = get_registry_stats()

        activities = list_activities()

        assert stats["total"] == len(activities)

    def test_stats_categories(self):
        """Test category counts in stats."""
        discover_all_libraries()
        stats = get_registry_stats()

        assert stats["categories"]["BuiltIn"] > 0


class TestDesktopUIActivities:
    """Tests for DesktopUI library activities."""

    def test_click_element_exists(self):
        """Test Click Element is registered."""
        discover_all_libraries()

        activity = get_activity("DesktopUI.click_element")

        assert activity is not None
        assert activity.name == "Click Element"
        assert activity.category == "Desktop"
        assert activity.rf_keyword == "Click Element"

    def test_input_text_exists(self):
        """Test Input Text is registered."""
        discover_all_libraries()

        activity = get_activity("DesktopUI.input_text")

        assert activity is not None
        assert "Input Text" in activity.name


class TestWebUIActivities:
    """Tests for WebUI library activities."""

    def test_open_browser_exists(self):
        """Test Open Browser is registered."""
        discover_all_libraries()

        activity = get_activity("WebUI.open_browser")

        assert activity is not None
        assert activity.category == "Web"

    def test_click_element_web(self):
        """Test web Click Element is registered."""
        discover_all_libraries()

        activity = get_activity("WebUI.click_element")

        assert activity is not None
        assert activity.category == "Web"
