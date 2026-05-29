import 'i18next';

export type Namespace =
  | 'common'
  | 'errors'
  | 'blocks'
  | 'builtin'
  | 'desktopui'
  | 'webui'
  | 'excel'
  | 'database'
  | 'ocr'
  | 'credentials'
  | 'file'
  | 'string'
  | 'datetime'
  | 'flow'
  | 'http'
  | 'variables';

export const NAMESPACES: Namespace[] = [
  'common',
  'errors',
  'blocks',
  'builtin',
  'desktopui',
  'webui',
  'excel',
  'database',
  'ocr',
  'credentials',
  'file',
  'string',
  'datetime',
  'flow',
  'http',
  'variables',
];

export type Language = 'en' | 'ru';

export interface I18nConfig {
  supportedLanguages: Language[];
  defaultLanguage: Language;
  namespaces: Namespace[];
}

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'common';
    resources: {
      common: {
        app: {
          name: string;
          about: string;
        };
        menu: {
          file: string;
          edit: string;
          view: string;
          help: string;
        };
        actions: {
          new: string;
          open: string;
          save: string;
          saveAs: string;
          close: string;
          undo: string;
          redo: string;
          cut: string;
          copy: string;
          paste: string;
          delete: string;
          selectAll: string;
          run: string;
          pause: string;
          resume: string;
          stop: string;
          debug: string;
          export: string;
          settings: string;
          cancel: string;
          ok: string;
          apply: string;
        };
        toolbar: {
          title: string;
          about: string;
          settings: string;
          run: string;
          pause: string;
          resume: string;
          stop: string;
          export: string;
          diagram: string;
          over: string;
          into: string;
          out: string;
          exportCode: string;
          viewMermaid: string;
          executionSpeed: string;
          cannotChangeSpeed: string;
          stepOver: string;
          stepInto: string;
          stepOut: string;
          addBlocksFirst: string;
          addActivitiesFirst: string;
          runProcessF5: string;
          openOrCreateProject: string;
          designer: string;
          debugger: string;
          console: string;
        };
        bridge: {
          title: string;
          ready: string;
          starting: string;
          degraded: string;
          reconnecting: string;
          stopped: string;
        };
        about: {
          title: string;
          subtitle: string;
          description: string;
          quickStart: string;
          step1: string;
          step2: string;
          step3: string;
          step4: string;
          step5: string;
          version: string;
        };
        welcome: {
          title: string;
          subtitle: string;
          newProcess: string;
          openProcess: string;
          recentFiles: string;
          noRecentFiles: string;
          description: string;
          startWithBlank: string;
          browseSaved: string;
          dontShowAgain: string;
        };
        help: {
          title: string;
          file: string;
          edit: string;
          canvas: string;
          run: string;
          debug: string;
        };
        shortcuts: {
          newProcess: string;
          openProcess: string;
          saveProcess: string;
          undo: string;
          redo: string;
          copySelected: string;
          paste: string;
          cutSelected: string;
          duplicateSelected: string;
          fitCanvas: string;
          deleteSelected: string;
          selectNext: string;
          moveNode: string;
          runProcess: string;
          pauseProcess: string;
          resumeProcess: string;
          stopProcess: string;
          toggleBreakpoint: string;
        };
        blocks: {
          start: string;
          end: string;
          task: string;
          if: string;
          else: string;
          elseIf: string;
          while: string;
          forEach: string;
          try: string;
          catch: string;
          finally: string;
          switch: string;
          case: string;
          comment: string;
          flow_control: string;
          error_handling: string;
          sub_diagrams: string;
          web_automation: string;
          desktop_automation: string;
          data_operations: string;
          settings: {
            theme_light: string;
            theme_dark: string;
            theme_system: string;
          };
        };
        blockDescriptions: {
          start: string;
          end: string;
          task: string;
          if: string;
          else: string;
          elseIf: string;
          while: string;
          'for-each': string;
          try: string;
          catch: string;
          finally: string;
          switch: string;
          case: string;
          comment: string;
          'try-catch': string;
          throw: string;
          parallel: string;
          'retry-scope': string;
          assign: string;
        };
        palette: {
          title: string;
          search: string;
          quickStart: string;
          noResults: string;
          clearSearch: string;
          notLoaded: string;
          startBridge: string;
          flowBlocks: string;
          sdkActivities: string;
          loading: string;
          blocks: string;
          activities: string;
          quickStartTips: {
            builtin: string;
            webUI: string;
            desktopUI: string;
            excel: string;
          };
          categories: {
            core: string;
            desktopUI: string;
            webUI: string;
            excel: string;
            database: string;
            file: string;
            ocr: string;
            builtin: string;
            string: string;
            datetime: string;
            variables: string;
            flow: string;
            credentials: string;
          };
          descriptions: {
            builtin: string;
            desktopUI: string;
            webUI: string;
            excel: string;
            file: string;
            string: string;
            datetime: string;
            variables: string;
            flow: string;
            database: string;
            ocr: string;
            credentials: string;
          };
          flowBlockDescriptions: {
            start: string;
            end: string;
            if: string;
            switch: string;
            while: string;
            forEach: string;
            parallel: string;
            retryScope: string;
            tryCatch: string;
            throw: string;
            assign: string;
          };
           blockDescriptions: {
             start: string;
             end: string;
             if: string;
             else: string;
             elseIf: string;
             while: string;
             forEach: string;
             tryCatch: string;
             throw: string;
             switch: string;
             case: string;
             parallel: string;
             retryScope: string;
             assign: string;
           };
           moreParams: string;
         };
         console: {
          searchPlaceholder: string;
          noLogsAvailable: string;
          runProcessForOutput: string;
          noLogsMatchFilter: string;
          autoScrollEnabled: string;
          autoScrollDisabled: string;
          exportLogs: string;
          clearLogs: string;
          entriesOf: string;
          maxEntries: string;
          error: string;
          warn: string;
          info: string;
          debug: string;
          trace: string;
          possibleCauses: string;
          suggestedFix: string;
          viewDocumentation: string;
          reportIssue: string;
          activity: string;
          library: string;
          errorCauses: {
            elementNotLoaded: string;
            wrongSelector: string;
            elementInDifferentFrame: string;
            pageLoadSlow: string;
            networkLatency: string;
            elementNeverAppeared: string;
            applicationNotRunning: string;
            wrongPortAddress: string;
            insufficientPrivileges: string;
            fileLocked: string;
            pathDoesNotExist: string;
            relativePathResolved: string;
            fileWasDeleted: string;
            incorrectPathCase: string;
            networkDriveDisconnected: string;
            variableUnexpectedType: string;
            callingMethodOnNull: string;
            objectNoAttribute: string;
            wrongObjectType: string;
            invalidArgumentValue: string;
            wrongDataFormat: string;
            dictionaryKeyDoesNotExist: string;
            typoInKeyName: string;
            listIndexOutOfRange: string;
            emptyList: string;
            xpathCssSyntaxError: string;
            elementRemovedFromDom: string;
            browserClosedUnexpectedly: string;
            browserDriverMismatch: string;
            syntaxErrorInQuery: string;
            tableColumnNotExist: string;
            databaseConnectionLost: string;
            connectionStringIncorrect: string;
            databaseServerNotRunning: string;
            authenticationFailed: string;
          };
          errorFix: {
            elementNotFound: string;
            increaseTimeout: string;
            checkApplicationRunning: string;
            checkPermissions: string;
            useAbsolutePaths: string;
            verifyFilePath: string;
            checkVariableType: string;
            verifyObjectStructure: string;
            checkExpectedFormat: string;
            verifyDictionaryKey: string;
            checkListLength: string;
            testSelectorInBrowser: string;
            restartBrowser: string;
            checkSqlSyntax: string;
            verifyConnectionCredentials: string;
          };
        };
        status: {
          ready: string;
          running: string;
          paused: string;
          stopped: string;
          completed: string;
          failed: string;
          opening: string;
          saving: string;
          unsaved: string;
          saved: string;
          hideConsole: string;
          showConsole: string;
          bridge: string;
          capabilitiesUnavailable: string;
          engine: string;
          debugger: string;
          noDebugger: string;
          libraries: string;
          reconnecting: string;
          degraded: string;
          hbFailures: string;
          runtimeSummary: string;
          debuggerPresent: string;
          debuggerMissing: string;
          tip: {
            quickAdd: string;
            dragConnect: string;
            copyPaste: string;
            doubleClick: string;
            pressF5: string;
            breakpoints: string;
            variablePanel: string;
            exportPython: string;
            saveProject: string;
          };
        };
        settings: {
          title: string;
          language: string;
          languageEnglish: string;
          languageRussian: string;
          theme: string;
          theme_light: string;
          theme_dark: string;
          theme_system: string;
          restartNote: string;
        };
        fileMenu: {
          newProject: string;
          newProcess: string;
          createProject: string;
          templates: string;
          openProject: string;
          saveAs: string;
          import: string;
          closeProject: string;
          exit: string;
          projectName: string;
          projectTemplate: string;
          processName: string;
          processTemplate: string;
          templateEmpty: string;
          templateEmptyDesc: string;
          templateEmptyIncludes: string;
          templateSimple: string;
          templateSimpleDesc: string;
          templateSimpleIncludes: string;
          templateRe: string;
          templateReDesc: string;
          templateReIncludes: string;
          quickCreate: string;
          createInFolder: string;
          createProcess: string;
          saveProjectAs: string;
          openFile: string;
          openFolder: string;
          saveProject: string;
          exportProject: string;
          selectFolder: string;
          dialogNotAvailable: string;
          projectOpened: string;
          projectSaved: string;
          createdProject: string;
          createdProcess: string;
          savedAs: string;
          opened: string;
          save: string;
          closeDialog: string;
        };
        recorder: {
          title: string;
          rec: string;
          paused: string;
          start: string;
          pause: string;
          resume: string;
          stop: string;
          actionsCount: string;
          startRecording: string;
          pauseRecording: string;
          resumeRecording: string;
          stopRecording: string;
        };
        dialogs: {
          storage: string;
          storageUsage: string;
          storageLimitExceeded: string;
          storageApproachingLimit: string;
          localStorageKeys: string;
          noDataStored: string;
          indexedDB: string;
          used: string;
          quota: string;
          maxStorage: string;
          failedToLoadStorage: string;
          clearLocal: string;
          clearAll: string;
          done: string;
          loading: string;
          confirm: string;
          inputParameters: string;
          outputParameters: string;
          add: string;
        };
        debugger: {
          variablePanelGuide: string;
          runtime: string;
          process: string;
          watch: string;
          noRuntimeVariables: string;
          noProcessVariables: string;
          noWatchedVariables: string;
          createProcessVariable: string;
          deleteVariable: string;
          executionHistory: string;
          all: string;
          completed: string;
          failed: string;
          stopped: string;
          noHistory: string;
          runToSeeHistory: string;
          callStack: string;
          noCallStack: string;
          startDebugging: string;
          breakpoints: string;
          noBreakpoints: string;
          clickToAddBreakpoint: string;
          active: string;
          disabled: string;
          line: string;
          clearAllBreakpoints: string;
          enableBreakpoint: string;
          disableBreakpoint: string;
          removeBreakpoint: string;
        };
        execution: {
          startingProcess: string;
          noEndBlock: string;
          processStarted: string;
          noProcessMetadata: string;
          createOrLoadFirst: string;
          executionFailed: string;
          failedToRun: string;
          autoConnectFailed: string;
          unableToConnect: string;
          bridgeConnectionFailed: string;
          stepOverFailed: string;
          unableToStepOver: string;
          stepIntoFailed: string;
          unableToStepInto: string;
          stepOutFailed: string;
          unableToStepOut: string;
          codeGenerationFailed: string;
          unableToGenerateCode: string;
          refreshDebuggerFailed: string;
          failedToGenerate: string;
        };
        layout: {
          processDiagram: string;
          executing: string;
        };
        debuggerPanel: {
          runtime: string;
          process: string;
          watch: string;
          noRuntimeVariables: string;
          noProcessVariables: string;
          noWatchedVariables: string;
          variablesDuringDebugging: string;
          variablesMatchQuery: string;
          variablesWillAppear: string;
          defineVariables: string;
          filterVariables: string;
          removeFromWatch: string;
          addToWatch: string;
          createVariable: string;
          createProcessVariable: string;
          deleteVariable: string;
          clearAllWatches: string;
          showGuide: string;
          empty: string;
          variablePanelGuide: string;
        };
        executionHistory: {
          title: string;
          noExecutionHistory: string;
          runProcessToSeeHistory: string;
          activities: string;
          executionsInHistory: string;
          all: string;
          completed: string;
          failed: string;
          stopped: string;
          clearHistory: string;
        };
        callStack: {
          title: string;
          noCallStack: string;
          startDebugging: string;
          vars: string;
        };
        breakpoints: {
          title: string;
          noBreakpoints: string;
          clickToAddBreakpoint: string;
          active: string;
          off: string;
          disabled: string;
          clearAllBreakpoints: string;
          enableBreakpoint: string;
          disableBreakpoint: string;
          removeBreakpoint: string;
          breakpoint: string;
          breakpointSet: string;
        };
        codeModal: {
          exportComplete: string;
          linesPython: string;
          toRunStandalone: string;
          download: string;
          downloadFiles: string;
          close: string;
          copied: string;
          copy: string;
        };
        canvas: {
          startBuilding: string;
          pressCtrlSpace: string;
          dragActivities: string;
          dropToAdd: string;
          nodeCopied: string;
          nodeCut: string;
          nodeDuplicated: string;
          selfConnection: string;
          invalidConnection: string;
          connectionExists: string;
          onlyOneIncoming: string;
          addedActivity: string;
        };
        variablesPanel: {
          variables: string;
          noVariables: string;
          openProjectVariables: string;
          addFirstVariable: string;
          process: string;
          task: string;
          edit: string;
          delete: string;
        };
        canvasToolbar: {
          undo: string;
          redo: string;
          alignLeft: string;
          alignCenterH: string;
          alignRight: string;
          alignTop: string;
          alignCenterV: string;
          alignBottom: string;
          distributeH: string;
          distributeV: string;
          enableGrid: string;
          disableGrid: string;
          lineStyle: string;
          blockLegend: string;
          blockTypes: string;
          moreOptions: string;
          entryPoint: string;
          exitPoint: string;
          decision: string;
          repeat: string;
          errorHandling: string;
          action: string;
          smartRouting: string;
          roundedCorners: string;
          sharpCorners: string;
          selectNodesToAlign: string;
          selectNodesToDistribute: string;
          alignedNodes: string;
          distributedNodes: string;
        };
        variableDialog: {
          createVariable: string;
          editVariable: string;
          name: string;
          type: string;
          value: string;
          scope: string;
          description: string;
          cancel: string;
          create: string;
          update: string;
          hideValue: string;
          showValue: string;
          anyType: string;
          stringType: string;
          numberType: string;
          booleanType: string;
          listType: string;
          dictType: string;
          secretType: string;
          processScope: string;
          taskScope: string;
          nameRequired: string;
          nameInvalid: string;
          nameExists: string;
          namePlaceholder: string;
          expressionPlaceholder: string;
          listPlaceholder: string;
          descriptionPlaceholder: string;
          close: string;
          type_any: string;
          type_string: string;
          type_number: string;
          type_boolean: string;
          type_list: string;
          type_dictionary: string;
          type_secret: string;
          scope_process: string;
          scope_task: string;
        };
        propertyPanel: {
          description: string;
          addDescription: string;
          tags: string;
          copyNodeId: string;
          nodeIdCopied: string;
          deleteNode: string;
          noParamsStartEnd: string;
          noParams: string;
          documentPurpose: string;
          diagramSettings: string;
          mainDiagram: string;
          subDiagram: string;
          inputArgs: string;
          outputArgs: string;
          editCode: string;
          editParam: string;
        };
        propertyEditors: {
          parallel: {
            branches: string;
            addBranch: string;
            branchesHelp: string;
            removeBranch: string;
          };
          switch: {
            expression: string;
            cases: string;
            caseLabel: string;
            label: string;
            value: string;
            addCase: string;
            removeCase: string;
            noCases: string;
          };
          retryScope: {
            stopConditionPlaceholder: string;
          };
          start: {
            processName: string;
            addTag: string;
            noTags: string;
            tagName: string;
            tagNamePlaceholder: string;
          };
        };
        quickAdd: {
          searchActivities: string;
          escToClose: string;
          noActivities: string;
          navigate: string;
          enterSelect: string;
        };
        diagramExplorer: {
          explorer: string;
          noProject: string;
          createProject: string;
          newFolder: string;
          newProcess: string;
          rename: string;
          duplicate: string;
          delete: string;
          open: string;
          showInFolder: string;
          settings: string;
          loading: string;
          noFiles: string;
          rightClickCreate: string;
          cannotUndo: string;
          confirmDelete: string;
        };
        selectorBuilder: {
          title: string;
          inspect: string;
          spy: string;
          clearSelector: string;
          windowElements: string;
          pageElements: string;
          use: string;
          inspectElements: string;
          visualPicker: string;
          insertSelector: string;
        };
        selectorTester: {
          testing: string;
          enterSelector: string;
          notFound: string;
          uniqueMatch: string;
          multipleMatches: string;
          highlightElement: string;
          copySelector: string;
        };
        elementTree: {
          filterByTag: string;
          clickInspect: string;
          noMatchFilter: string;
        };
        actionList: {
          actions: string;
          noActions: string;
          startRecording: string;
          export: string;
          deleteAction: string;
        };
        selectorSpy: {
          title: string;
          web: string;
          desktop: string;
          startCapture: string;
          stopCapture: string;
          captureHint: string;
          hoverElements: string;
          elementSelected: string;
          spyStopped: string;
          elementCaptured: string;
          elementInfo: string;
          tag: string;
          automationId: string;
          text: string;
          class: string;
          selectSelector: string;
          useCallback: string;
          close: string;
          namePlaceholder: string;
          expressionPlaceholder: string;
          descriptionPlaceholder: string;
        };
        codeEditor: {
          variablesPanel: {
            searchPlaceholder: string;
            addVariablesHint: string;
          };
          snippetPanel: {
            searchPlaceholder: string;
          };
          toolbar: {
            find: string;
            replace: string;
            formatCode: string;
            snippets: string;
            variables: string;
          };
        };
        retryIntervals: {
          oneSecond: string;
          twoSeconds: string;
          fiveSeconds: string;
          tenSeconds: string;
          thirtySeconds: string;
          oneMinute: string;
        };
        retry_scope: string;
        enable_finally: string;
        retry_summary: string;
        attempts_label: string;
        interval_label: string;
        condition_label: string;
        attempts_value: string;
        condition_value: string;
        preview: string;
        code: string;
        view_as_code: string;
        rendering_diagram: string;
        mermaid_flowchart: string;
        find: string;
        replace: string;
        format: string;
        snippets: string;
        variables: string;
        download_files: string;
        download: string;
        to_run_standalone: string;
        copied: string;
        to: string;
        true: string;
        false: string;
        name: string;
        description_label: string;
        input_parameters: string;
        input_values: string;
        output_parameters: string;
        output_values: string;
        cancel: string;
        save: string;
        argument_placeholder: string;
        result_placeholder: string;
        no_variables_defined: string;
        process_variables: string;
        task_variables: string;
        variables_count: string;
        esc_to_close: string;
        no_activities_found: string;
        navigate: string;
        enter_select: string;
        click_inspect: string;
        no_match_filter: string;
        selector_xpath_or_css: string;
        boolean_true: string;
        boolean_false: string;
        sidebar: {
          activities: string;
          diagrams: string;
          debugControls: string;
          variables: string;
          breakpoints: string;
          consoleSettings: string;
          consoleDescription: string;
        };
        editableTextField: {
          openEditor: string;
        };
        editor: {
          editValue: string;
        };
        forEachBlockEditor: {
          itemVariable: string;
          itemPlaceholder: string;
          collection: string;
          collectionPlaceholder: string;
          collectionHelp: string;
          parallelExecution: string;
          parallelWarning: string;
          timeout: string;
          timeoutHelp: string;
          bodyPort: string;
          bodyPortHelp: string;
          nextPort: string;
          nextPortHelp: string;
        };
        ifBlockEditor: {
          condition: string;
          conditionPlaceholder: string;
        };
        whileBlockEditor: {
          condition: string;
          maxIterations: string;
          maxIterationsHelp: string;
          timeout: string;
          timeoutHelp: string;
          bodyPort: string;
          bodyPortHelp: string;
          nextPort: string;
          nextPortHelp: string;
          conditionPlaceholder: string;
        };
        inlineLoading: {
          loading: string;
        };
        fieldHelp: {
          helpFor: string;
          format: string;
          examples: string;
        };
        assign: {
          variableName: string;
          variableNamePlaceholder: string;
          variableType: string;
          expression: string;
          expressionPlaceholder: string;
          scope: string;
          processScope: string;
          taskScope: string;
          scopeHint: string;
        };
        variablePicker: {
          noVariables: string;
        };
        fileMenu_newProject: string;
        fileMenu_newProcess: string;
        fileMenu_createProject: string;
        fileMenu_templates: string;
        fileMenu_openProject: string;
        fileMenu_saveAs: string;
        fileMenu_import: string;
        fileMenu_closeProject: string;
        fileMenu_exit: string;
        fileMenu_projectName: string;
        fileMenu_projectTemplate: string;
        fileMenu_processName: string;
        fileMenu_processTemplate: string;
        fileMenu_templateEmpty: string;
        fileMenu_templateEmptyDesc: string;
        fileMenu_templateEmptyIncludes: string;
        fileMenu_templateSimple: string;
        fileMenu_templateSimpleDesc: string;
        fileMenu_templateSimpleIncludes: string;
        fileMenu_templateRe: string;
        fileMenu_templateReDesc: string;
        fileMenu_templateReIncludes: string;
        fileMenu_quickCreate: string;
        fileMenu_createInFolder: string;
        fileMenu_createProcess: string;
        fileMenu_saveProjectAs: string;
        fileMenu_openFile: string;
        fileMenu_openFolder: string;
        fileMenu_saveProject: string;
        fileMenu_exportProject: string;
        fileMenu_selectFolder: string;
        fileMenu_dialogNotAvailable: string;
        fileMenu_projectOpened: string;
        fileMenu_projectSaved: string;
        fileMenu_createdProject: string;
        fileMenu_createdProcess: string;
        fileMenu_savedAs: string;
        fileMenu_opened: string;
        fileMenu_save: string;
        fileMenu_closeDialog: string;
        language_switcher: {
          english: string;
          russian: string;
        };
        theme_switcher: {
          light: string;
          dark: string;
          system: string;
        };
      };
      errors: {
        validation: {
          required: string;
          minLength: string;
          maxLength: string;
          email: string;
          url: string;
          number: string;
        };
        network: {
          connectionLost: string;
          timeout: string;
          serverError: string;
        };
        file: {
          notFound: string;
          accessDenied: string;
          invalidFormat: string;
        };
        activity: {
          notFound: string;
          invalidConfiguration: string;
          executionFailed: string;
        };
      };
      blocks: {
        start: string;
        end: string;
        task: string;
        if: string;
        else: string;
        elseIf: string;
        while: string;
        forEach: string;
        try: string;
        catch: string;
        finally: string;
        switch: string;
        case: string;
        comment: string;
        parallel: string;
        retryScope: string;
        tryCatch: string;
        throw: string;
        assign: string;
        callSubDiagram: string;
      };
      builtin: {
        log: {
          title: string;
          description: string;
        };
        sleep: {
          title: string;
          description: string;
        };
        setVariable: {
          title: string;
          description: string;
        };
      };
      desktopui: {
        openApplication: {
          title: string;
          description: string;
        };
        waitWindowState: {
          title: string;
          description: string;
        };
        inputText: {
          title: string;
          description: string;
        };
      };
      webui: {
        openBrowser: {
          title: string;
          description: string;
        };
        navigateTo: {
          title: string;
          description: string;
        };
        clickElement: {
          title: string;
          description: string;
        };
      };
      excel: {
        openWorkbook: {
          title: string;
          description: string;
        };
        readRange: {
          title: string;
          description: string;
        };
        writeRange: {
          title: string;
          description: string;
        };
      };
      database: {
        createConnection: {
          title: string;
          description: string;
        };
        executeQuery: {
          title: string;
          description: string;
        };
      };
      ocr: {
        recognizeText: {
          title: string;
          description: string;
        };
      };
      credentials: {
        setPassword: {
          title: string;
          description: string;
        };
        getPassword: {
          title: string;
          description: string;
        };
      };
      file: {
        readFile: {
          title: string;
          description: string;
        };
        writeFile: {
          title: string;
          description: string;
        };
      };
      string: {
        concatenate: {
          title: string;
          description: string;
        };
        format: {
          title: string;
          description: string;
        };
      };
      datetime: {
        getCurrentTime: {
          title: string;
          description: string;
        };
        formatTime: {
          title: string;
          description: string;
        };
      };
      flow: {
        if: string;
        while: string;
        for: string;
        break: string;
        continue: string;
      };
      http: {
        get: {
          title: string;
          description: string;
        };
        post: {
          title: string;
          description: string;
        };
      };
      variables: {
        set: string;
        get: string;
        list: string;
        clear: string;
      };
    };
  }
}
