*** Settings ***
Documentation     Hello World example for RPAForge
Library           RPAForge.DesktopUI

*** Tasks ***
Hello World
    [Documentation]    Simple Hello World automation
    
    Log    Starting Hello World example
    
    # Open Notepad
    Open Application    notepad.exe
    
    # Wait for window
    Wait For Window    Notepad    timeout=10s
    
    # Type message
    Input Text    ${None}    Hello, World! This is my first RPAForge bot.
    
    # Wait a moment to see the result
    Sleep    2s
    
    # Close without saving
    Press Keys    %{F4}
    Sleep    1s
    Press Keys    n
    
    Log    Hello World example complete!
