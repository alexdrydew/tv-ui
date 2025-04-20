'use strict';
var __assign =
    (this && this.__assign) ||
    function () {
        __assign =
            Object.assign ||
            function (t) {
                for (var s, i = 1, n = arguments.length; i < n; i++) {
                    s = arguments[i];
                    for (var p in s)
                        if (Object.prototype.hasOwnProperty.call(s, p))
                            t[p] = s[p];
                }
                return t;
            };
        return __assign.apply(this, arguments);
    };
var __awaiter =
    (this && this.__awaiter) ||
    function (thisArg, _arguments, P, generator) {
        function adopt(value) {
            return value instanceof P
                ? value
                : new P(function (resolve) {
                      resolve(value);
                  });
        }
        return new (P || (P = Promise))(function (resolve, reject) {
            function fulfilled(value) {
                try {
                    step(generator.next(value));
                } catch (e) {
                    reject(e);
                }
            }
            function rejected(value) {
                try {
                    step(generator['throw'](value));
                } catch (e) {
                    reject(e);
                }
            }
            function step(result) {
                result.done
                    ? resolve(result.value)
                    : adopt(result.value).then(fulfilled, rejected);
            }
            step(
                (generator = generator.apply(thisArg, _arguments || [])).next(),
            );
        });
    };
var __generator =
    (this && this.__generator) ||
    function (thisArg, body) {
        var _ = {
                label: 0,
                sent: function () {
                    if (t[0] & 1) throw t[1];
                    return t[1];
                },
                trys: [],
                ops: [],
            },
            f,
            y,
            t,
            g = Object.create(
                (typeof Iterator === 'function' ? Iterator : Object).prototype,
            );
        return (
            (g.next = verb(0)),
            (g['throw'] = verb(1)),
            (g['return'] = verb(2)),
            typeof Symbol === 'function' &&
                (g[Symbol.iterator] = function () {
                    return this;
                }),
            g
        );
        function verb(n) {
            return function (v) {
                return step([n, v]);
            };
        }
        function step(op) {
            if (f) throw new TypeError('Generator is already executing.');
            while ((g && ((g = 0), op[0] && (_ = 0)), _))
                try {
                    if (
                        ((f = 1),
                        y &&
                            (t =
                                op[0] & 2
                                    ? y['return']
                                    : op[0]
                                      ? y['throw'] ||
                                        ((t = y['return']) && t.call(y), 0)
                                      : y.next) &&
                            !(t = t.call(y, op[1])).done)
                    )
                        return t;
                    if (((y = 0), t)) op = [op[0] & 2, t.value];
                    switch (op[0]) {
                        case 0:
                        case 1:
                            t = op;
                            break;
                        case 4:
                            _.label++;
                            return { value: op[1], done: false };
                        case 5:
                            _.label++;
                            y = op[1];
                            op = [0];
                            continue;
                        case 7:
                            op = _.ops.pop();
                            _.trys.pop();
                            continue;
                        default:
                            if (
                                !((t = _.trys),
                                (t = t.length > 0 && t[t.length - 1])) &&
                                (op[0] === 6 || op[0] === 2)
                            ) {
                                _ = 0;
                                continue;
                            }
                            if (
                                op[0] === 3 &&
                                (!t || (op[1] > t[0] && op[1] < t[3]))
                            ) {
                                _.label = op[1];
                                break;
                            }
                            if (op[0] === 6 && _.label < t[1]) {
                                _.label = t[1];
                                t = op;
                                break;
                            }
                            if (t && _.label < t[2]) {
                                _.label = t[2];
                                _.ops.push(op);
                                break;
                            }
                            if (t[2]) _.ops.pop();
                            _.trys.pop();
                            continue;
                    }
                    op = body.call(thisArg, _);
                } catch (e) {
                    op = [6, e];
                    y = 0;
                } finally {
                    f = t = 0;
                }
            if (op[0] & 5) throw op[1];
            return { value: op[0] ? op[1] : void 0, done: true };
        }
    };
Object.defineProperty(exports, '__esModule', { value: true });
var playwright_1 = require('playwright');
var test_1 = require('@playwright/test');
var promises_1 = require('node:fs/promises');
var node_path_1 = require('node:path'); // Import join
var node_os_1 = require('node:os'); // Import tmpdir
var glob_1 = require('glob');
var node_process_1 = require('node:process');
process.env.PLAYWRIGHT_TEST = 'true';
var test = test_1.test.extend({
    electronApp: [
        function (_a, use_1) {
            return __awaiter(void 0, [_a, use_1], void 0, function (_b, use) {
                var executablePattern,
                    executablePath,
                    tempConfigDir,
                    configFilePath,
                    configDir,
                    sampleAppConfig,
                    err_1,
                    electronApp,
                    err_2;
                return __generator(this, function (_c) {
                    switch (_c.label) {
                        case 0:
                            executablePattern = 'dist/*/root{,.*}';
                            if (node_process_1.platform === 'darwin') {
                                executablePattern += '/Contents/*/root';
                            }
                            executablePath = (0, glob_1.globSync)(
                                executablePattern,
                            )[0];
                            if (!executablePath) {
                                throw new Error(
                                    'App Executable path not found',
                                );
                            }
                            tempConfigDir = (0, node_path_1.join)(
                                (0, node_os_1.tmpdir)(),
                                'tv-ui-test-'.concat(Date.now()),
                            );
                            configFilePath = (0, node_path_1.join)(
                                tempConfigDir,
                                'tv-ui.json',
                            );
                            configDir = (0, node_path_1.dirname)(
                                configFilePath,
                            );
                            sampleAppConfig = [
                                {
                                    id: 'test-app-1',
                                    name: 'Test App', // Name used for locating the tile
                                    launchCommand: '/bin/echo', // Renamed from 'command'
                                    args: ['hello'],
                                    icon: undefined, // Use undefined for optional fields
                                },
                            ];
                            _c.label = 1;
                        case 1:
                            _c.trys.push([1, 4, , 5]);
                            return [
                                4 /*yield*/,
                                (0, promises_1.mkdir)(configDir, {
                                    recursive: true,
                                }),
                            ];
                        case 2:
                            _c.sent();
                            // Write the sample config to the file
                            return [
                                4 /*yield*/,
                                (0, promises_1.writeFile)(
                                    configFilePath,
                                    JSON.stringify(sampleAppConfig, null, 2), // Pretty print for readability if needed
                                    'utf-8',
                                ),
                            ];
                        case 3:
                            // Write the sample config to the file
                            _c.sent();
                            console.log(
                                'Created config file with sample app: '.concat(
                                    configFilePath,
                                ),
                            );
                            return [3 /*break*/, 5];
                        case 4:
                            err_1 = _c.sent();
                            console.error(
                                'Failed to create config file: '.concat(err_1),
                            );
                            // Decide if we should throw or proceed cautiously
                            throw new Error(
                                'Setup failed: Could not create config file at '.concat(
                                    configFilePath,
                                ),
                            );
                        case 5:
                            return [
                                4 /*yield*/,
                                playwright_1._electron.launch({
                                    executablePath: executablePath,
                                    args: ['--no-sandbox'],
                                    env: __assign(__assign({}, process.env), {
                                        TV_UI_CONFIG_PATH: configFilePath,
                                    }),
                                }),
                            ];
                        case 6:
                            electronApp = _c.sent();
                            electronApp.on('console', function (msg) {
                                if (msg.type() === 'error') {
                                    console.error(
                                        '[electron]['
                                            .concat(msg.type(), '] ')
                                            .concat(msg.text()),
                                    );
                                }
                            });
                            return [4 /*yield*/, use(electronApp)];
                        case 7:
                            _c.sent();
                            // This code runs after all the tests in the worker process.
                            return [4 /*yield*/, electronApp.close()];
                        case 8:
                            // This code runs after all the tests in the worker process.
                            _c.sent();
                            _c.label = 9;
                        case 9:
                            _c.trys.push([9, 11, , 12]);
                            // Use the tempConfigDir path generated earlier
                            return [
                                4 /*yield*/,
                                (0, promises_1.rm)(tempConfigDir, {
                                    recursive: true,
                                    force: true,
                                }),
                            ];
                        case 10:
                            // Use the tempConfigDir path generated earlier
                            _c.sent();
                            console.log(
                                'Cleaned up temporary config dir: '.concat(
                                    tempConfigDir,
                                ),
                            );
                            return [3 /*break*/, 12];
                        case 11:
                            err_2 = _c.sent();
                            // Log error but don't fail the test run just for cleanup failure
                            console.error(
                                'Failed to clean up temporary config dir: '.concat(
                                    err_2,
                                ),
                            );
                            return [3 /*break*/, 12];
                        case 12:
                            return [2 /*return*/];
                    }
                });
            });
        },
        { scope: 'worker', auto: true },
    ],
    page: function (_a, use_1) {
        return __awaiter(void 0, [_a, use_1], void 0, function (_b, use) {
            var page;
            var electronApp = _b.electronApp;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        return [4 /*yield*/, electronApp.firstWindow()];
                    case 1:
                        page = _c.sent();
                        // capture errors
                        page.on('pageerror', function (error) {
                            console.error(error);
                        });
                        // capture console messages
                        page.on('console', function (msg) {
                            console.log(msg.text());
                        });
                        return [4 /*yield*/, page.waitForLoadState('load')];
                    case 2:
                        _c.sent();
                        return [4 /*yield*/, use(page)];
                    case 3:
                        _c.sent();
                        return [2 /*return*/];
                }
            });
        });
    },
    electronVersions: function (_a, use_1) {
        return __awaiter(void 0, [_a, use_1], void 0, function (_b, use) {
            var _c;
            var electronApp = _b.electronApp;
            return __generator(this, function (_d) {
                switch (_d.label) {
                    case 0:
                        _c = use;
                        return [
                            4 /*yield*/,
                            electronApp.evaluate(function () {
                                return process.versions;
                            }),
                        ];
                    case 1:
                        return [4 /*yield*/, _c.apply(void 0, [_d.sent()])];
                    case 2:
                        _d.sent();
                        return [2 /*return*/];
                }
            });
        });
    },
});
test('Main window state', function (_a) {
    return __awaiter(void 0, [_a], void 0, function (_b) {
        var window, windowState;
        var electronApp = _b.electronApp,
            page = _b.page;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    return [4 /*yield*/, electronApp.browserWindow(page)];
                case 1:
                    window = _c.sent();
                    return [
                        4 /*yield*/,
                        window.evaluate(function (mainWindow) {
                            var getState = function () {
                                return {
                                    isVisible: mainWindow.isVisible(),
                                    isDevToolsOpened:
                                        mainWindow.webContents.isDevToolsOpened(),
                                    isCrashed:
                                        mainWindow.webContents.isCrashed(),
                                };
                            };
                            return new Promise(function (resolve) {
                                /**
                                 * The main window is created hidden, and is shown only when it is ready.
                                 * See {@link ../packages/main/src/mainWindow.ts} function
                                 */
                                if (mainWindow.isVisible()) {
                                    resolve(getState());
                                } else {
                                    mainWindow.once(
                                        'ready-to-show',
                                        function () {
                                            return resolve(getState());
                                        },
                                    );
                                }
                            });
                        }),
                    ];
                case 2:
                    windowState = _c.sent();
                    (0, test_1.expect)(
                        windowState.isCrashed,
                        'The app has crashed',
                    ).toEqual(false);
                    (0, test_1.expect)(
                        windowState.isVisible,
                        'The main window was not visible',
                    ).toEqual(true);
                    (0, test_1.expect)(
                        windowState.isDevToolsOpened,
                        'The DevTools panel was open',
                    ).toEqual(false);
                    return [2 /*return*/];
            }
        });
    });
});
test('App layout is rendered', function (_a) {
    return __awaiter(void 0, [_a], void 0, function (_b) {
        var mainElement;
        var page = _b.page;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    mainElement = page.locator('main.overflow-auto');
                    // Now that we know it has appeared, we can assert its visibility (optional, but good practice)
                    return [
                        4 /*yield*/,
                        (0, test_1.expect)(
                            mainElement,
                            'The <main> element from TvAppLayout should be visible',
                        ).toBeVisible(),
                    ];
                case 1:
                    // Now that we know it has appeared, we can assert its visibility (optional, but good practice)
                    _c.sent();
                    return [2 /*return*/];
            }
        });
    });
});
test('App tile is rendered when config has an app', function (_a) {
    return __awaiter(void 0, [_a], void 0, function (_b) {
        var appTileButton;
        var page = _b.page;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    appTileButton = page.getByRole('button', {
                        name: 'Test App',
                    });
                    // Assert that the AppTile button is visible
                    return [
                        4 /*yield*/,
                        (0, test_1.expect)(
                            appTileButton,
                            'The AppTile for "Test App" should be visible',
                        ).toBeVisible(),
                    ];
                case 1:
                    // Assert that the AppTile button is visible
                    _c.sent();
                    return [2 /*return*/];
            }
        });
    });
});
