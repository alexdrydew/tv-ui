{
  inputs = {
    flake-utils.url = "github:numtide/flake-utils";
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-25.05";
    nixpkgs-darwin.url = "github:NixOS/nixpkgs/nixpkgs-25.05-darwin";
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
              nodejs = super.nodejs_latest;
              nodejs-slim = super.nodejs_latest;
            })
          ];
        };
        inherit (pkgs) lib stdenv;

        commonPackages = with pkgs; [
          pkg-config
          gobject-introspection
          cargo
          nodejs_24

          rustup
          lld
          napi-rs-cli

          python3Full

          nodePackages.pnpm
          nodePackages.yarn
          nodePackages.typescript
          nodePackages.typescript-language-server
        ];

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

        darwinPackages = with pkgs; [
        ];

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
              shellHook = ''
                export PATH="${pkgs.nodejs_24}/bin:$PATH"
                # Any other Darwin-specific shell setup
              '';
              env = commonEnv; # Pass common environment variables
            };
          };
      }
    );
}
