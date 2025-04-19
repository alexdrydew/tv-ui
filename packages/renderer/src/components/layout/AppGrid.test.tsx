// import { render, screen, fireEvent, cleanup } from '@testing-library/react';
// import '@testing-library/jest-dom/vitest';
// import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
// import { AppGrid } from './AppGrid';
// import { App } from '@/entities/app';
//
// const mockApps: App[] = [
//     {
//         config: {
//             id: 'app1',
//             name: 'App One',
//             icon: 'icon1.png',
//             launchCommand: 'cmd1',
//         },
//         instances: [],
//     },
//     {
//         config: {
//             id: 'app2',
//             name: 'App Two',
//             icon: 'icon2.png',
//             launchCommand: 'cmd2',
//         },
//         instances: [],
//     },
//     {
//         config: {
//             id: 'app3',
//             name: 'App Three',
//             icon: 'icon3.png',
//             launchCommand: 'cmd3',
//         },
//         instances: [],
//     },
// ];
//
// const mockOnLaunchApp = vi.fn();
// const mockOnKillApp = vi.fn();
// const mockOnRemoveApp = vi.fn();
// const mockOnEditApp = vi.fn();
//
// describe('AppGrid', () => {
//     beforeEach(() => {
//         vi.clearAllMocks();
//         document.body.focus();
//     });
//
//     afterEach(() => {
//         cleanup();
//     });
//
//     it('should focus the first app tile initially', () => {
//         render(
//             <AppGrid<App>
//                 apps={mockApps}
//                 onLaunchApp={mockOnLaunchApp}
//                 onKillApp={mockOnKillApp}
//                 onRemoveApp={mockOnRemoveApp}
//                 onEditApp={mockOnEditApp}
//                 renderItem={({ app, isFocused }) => (
//                     <div
//                         key={app.config.id}
//                         data-testid={`app-tile-${app.config.name}`}
//                         data-focused={String(isFocused)}
//                     >
//                         {app.config.name}
//                     </div>
//                 )}
//             />,
//         );
//         expect(screen.getByTestId('app-tile-App One')).toHaveAttribute(
//             'data-focused',
//             'true',
//         );
//         expect(screen.getByTestId('app-tile-App Two')).toHaveAttribute(
//             'data-focused',
//             'false',
//         );
//         expect(screen.getByTestId('app-tile-App Three')).toHaveAttribute(
//             'data-focused',
//             'false',
//         );
//     });
//
//     describe('Keyboard Navigation: ArrowRight', () => {
//         it('should focus the next app tile when ArrowRight is pressed', () => {
//             render(
//                 <AppGrid<App>
//                     apps={mockApps}
//                     onLaunchApp={mockOnLaunchApp}
//                     onKillApp={mockOnKillApp}
//                     onRemoveApp={mockOnRemoveApp}
//                     onEditApp={mockOnEditApp}
//                     renderItem={({ app, isFocused }) => (
//                         <div
//                             key={app.config.id}
//                             data-testid={`app-tile-${app.config.name}`}
//                             data-focused={String(isFocused)}
//                         >
//                             {app.config.name}
//                         </div>
//                     )}
//                 />,
//             );
//             fireEvent.keyDown(document.body, { key: 'ArrowRight' });
//
//             expect(screen.getByTestId('app-tile-App One')).toHaveAttribute(
//                 'data-focused',
//                 'false',
//             );
//             expect(screen.getByTestId('app-tile-App Two')).toHaveAttribute(
//                 'data-focused',
//                 'true',
//             );
//             expect(screen.getByTestId('app-tile-App Three')).toHaveAttribute(
//                 'data-focused',
//                 'false',
//             );
//         });
//
//         it('should focus the last app tile when ArrowRight is pressed multiple times', () => {
//             render(
//                 <AppGrid<App>
//                     apps={mockApps}
//                     onLaunchApp={mockOnLaunchApp}
//                     onKillApp={mockOnKillApp}
//                     onRemoveApp={mockOnRemoveApp}
//                     onEditApp={mockOnEditApp}
//                     renderItem={({ app, isFocused }) => (
//                         <div
//                             key={app.config.id}
//                             data-testid={`app-tile-${app.config.name}`}
//                             data-focused={String(isFocused)}
//                         >
//                             {app.config.name}
//                         </div>
//                     )}
//                 />,
//             );
//             fireEvent.keyDown(document.body, { key: 'ArrowRight' });
//             fireEvent.keyDown(document.body, { key: 'ArrowRight' });
//
//             expect(screen.getByTestId('app-tile-App One')).toHaveAttribute(
//                 'data-focused',
//                 'false',
//             );
//             expect(screen.getByTestId('app-tile-App Two')).toHaveAttribute(
//                 'data-focused',
//                 'false',
//             );
//             expect(screen.getByTestId('app-tile-App Three')).toHaveAttribute(
//                 'data-focused',
//                 'true',
//             );
//         });
//
//         it('should not change focus when ArrowRight is pressed on the last app tile', () => {
//             render(
//                 <AppGrid<App>
//                     apps={mockApps}
//                     onLaunchApp={mockOnLaunchApp}
//                     onKillApp={mockOnKillApp}
//                     onRemoveApp={mockOnRemoveApp}
//                     onEditApp={mockOnEditApp}
//                     renderItem={({ app, isFocused }) => (
//                         <div
//                             key={app.config.id}
//                             data-testid={`app-tile-${app.config.name}`}
//                             data-focused={String(isFocused)}
//                         >
//                             {app.config.name}
//                         </div>
//                     )}
//                 />,
//             );
//             fireEvent.keyDown(document.body, { key: 'ArrowRight' });
//             fireEvent.keyDown(document.body, { key: 'ArrowRight' });
//             expect(screen.getByTestId('app-tile-App Three')).toHaveAttribute(
//                 'data-focused',
//                 'true',
//             );
//
//             fireEvent.keyDown(document.body, { key: 'ArrowRight' });
//
//             expect(screen.getByTestId('app-tile-App One')).toHaveAttribute(
//                 'data-focused',
//                 'false',
//             );
//             expect(screen.getByTestId('app-tile-App Two')).toHaveAttribute(
//                 'data-focused',
//                 'false',
//             );
//             expect(screen.getByTestId('app-tile-App Three')).toHaveAttribute(
//                 'data-focused',
//                 'true',
//             );
//         });
//     });
//
//     describe('Keyboard Navigation: ArrowLeft', () => {
//         it('should focus the previous app tile when ArrowLeft is pressed', () => {
//             render(
//                 <AppGrid<App>
//                     apps={mockApps}
//                     onLaunchApp={mockOnLaunchApp}
//                     onKillApp={mockOnKillApp}
//                     onRemoveApp={mockOnRemoveApp}
//                     onEditApp={mockOnEditApp}
//                     renderItem={({ app, isFocused }) => (
//                         <div
//                             key={app.config.id}
//                             data-testid={`app-tile-${app.config.name}`}
//                             data-focused={String(isFocused)}
//                         >
//                             {app.config.name}
//                         </div>
//                     )}
//                 />,
//             );
//             fireEvent.keyDown(document.body, { key: 'ArrowRight' });
//             expect(screen.getByTestId('app-tile-App Two')).toHaveAttribute(
//                 'data-focused',
//                 'true',
//             );
//
//             fireEvent.keyDown(document.body, { key: 'ArrowLeft' });
//
//             expect(screen.getByTestId('app-tile-App One')).toHaveAttribute(
//                 'data-focused',
//                 'true',
//             );
//             expect(screen.getByTestId('app-tile-App Two')).toHaveAttribute(
//                 'data-focused',
//                 'false',
//             );
//             expect(screen.getByTestId('app-tile-App Three')).toHaveAttribute(
//                 'data-focused',
//                 'false',
//             );
//         });
//
//         it('should not change focus when ArrowLeft is pressed on the first app tile', () => {
//             render(
//                 <AppGrid<App>
//                     apps={mockApps}
//                     onLaunchApp={mockOnLaunchApp}
//                     onKillApp={mockOnKillApp}
//                     onRemoveApp={mockOnRemoveApp}
//                     onEditApp={mockOnEditApp}
//                     renderItem={({ app, isFocused }) => (
//                         <div
//                             key={app.config.id}
//                             data-testid={`app-tile-${app.config.name}`}
//                             data-focused={String(isFocused)}
//                         >
//                             {app.config.name}
//                         </div>
//                     )}
//                 />,
//             );
//             expect(screen.getByTestId('app-tile-App One')).toHaveAttribute(
//                 'data-focused',
//                 'true',
//             );
//
//             fireEvent.keyDown(document.body, { key: 'ArrowLeft' });
//
//             expect(screen.getByTestId('app-tile-App One')).toHaveAttribute(
//                 'data-focused',
//                 'true',
//             );
//             expect(screen.getByTestId('app-tile-App Two')).toHaveAttribute(
//                 'data-focused',
//                 'false',
//             );
//             expect(screen.getByTestId('app-tile-App Three')).toHaveAttribute(
//                 'data-focused',
//                 'false',
//             );
//         });
//     });
// });
