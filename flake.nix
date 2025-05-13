{
  inputs = {
    flake-utils.url = "github:numtide/flake-utils";
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-24.11";
    nixpkgs-darwin.url = "github:NixOS/nixpkgs/nixpkgs-24.11-darwin";
    rust-overlay = {
      url = "github:oxalica/rust-overlay";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs = inputs:
    inputs.flake-utils.lib.eachDefaultSystem (
      system: let
        nixpkgs-input =
          if inputs.nixpkgs.legacyPackages.${system}.stdenv.isDarwin
          then inputs.nixpkgs-darwin
          else inputs.nixpkgs;
        pkgs = import nixpkgs-input {
          inherit system;
          overlays = [
            (self: super: {
              nodejs_23 = super.nodejs_23.overrideAttrs (old: {
                # some bug with nodejs 23 test idk
                doCheck = false;
                doInstallCheck = false;
              });
            })
            # for correct version in global npm packages
            (self: super: {
              nodejs = super.nodejs_23;
              nodejs-slim = super.nodejs_23;
            })
          ];
        };
        inherit (pkgs) lib stdenv;

        # Common packages for both Linux and Darwin
        commonPackages = with pkgs; [
          pkg-config
          gobject-introspection
          cargo
          cargo-tauri
          nodejs_23 # nodejs alias is set via overlay

          rustup
          lld
          napi-rs-cli

          nodePackages.pnpm
          nodePackages.yarn
          nodePackages.typescript
          nodePackages.typescript-language-server
        ];

        # Linux specific packages
        linuxPackages = with pkgs; [
          at-spi2-atk
          atkmm
          cairo
          gdk-pixbuf
          glib
          gtk3
          harfbuzz
          librsvg
          libsoup_3
          pango
          openssl # Needed by gtk3 etc. on Linux

          webkitgtk_4_1
          patchelf
          nss
          nspr
          dbus
          cups
          xorg.libX11
          xorg.libXcomposite
          xorg.libXdamage
          xorg.libXext
          xorg.libXfixes
          xorg.libXrandr
          xorg.libxcb
          mesa
          expat
          libxkbcommon
          alsa-lib
          systemd
          libxcrypt
          libxcrypt-legacy
          binutils
        ];

        # Darwin specific packages
        darwinPackages = with pkgs; [
        ];

        # Common environment variables
        commonEnv = {
          # Fixes https://github.com/rust-lang/rust-analyzer/issues/19135
          RUSTFLAGS = "-C link-arg=-fuse-ld=lld";
        };
      in {
        devShells =
          lib.optionalAttrs stdenv.isLinux {
            default =
              (pkgs.buildFHSUserEnv {
                name = "tv-ui-electron-linux";
                targetPkgs = pkgs: commonPackages ++ linuxPackages;
                runScript = "zsh"; # Or bash, depending on preference
              })
              .env;
          }
          // lib.optionalAttrs stdenv.isDarwin {
            default = pkgs.mkShell {
              name = "tv-ui-electron-darwin";
              nativeBuildInputs = commonPackages ++ darwinPackages;
              # LD_LIBRARY_PATH is generally not needed/used on Darwin like on Linux
              shellHook = ''
                export PATH="${pkgs.nodejs_23}/bin:$PATH"
                # Any other Darwin-specific shell setup
              '';
              env = commonEnv; # Pass common environment variables
            };
          };
      }
    );
}
