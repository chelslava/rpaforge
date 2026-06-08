"""Auto-generated RPAForge process."""


def Complex_Process():
    if ${status} == "approved":
        builtin.log("Approval confirmed")
    else:
        desktopui.open_application("notepad.exe")
    builtin.log("Not approved - opening notepad")
    builtin.log("Processing complete")
    # End
from rpaforge_libraries.DesktopUI import *



if __name__ == "__main__":
    Complex_Process()
