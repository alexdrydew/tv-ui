{
  inputs = {
    flake-utils.url = "github:numtide/flake-utils";
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-24.11";
    rust-overlay = {
      url = "github:oxalica/rust-overlay";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs = inputs:
    inputs.flake-utils.lib.eachDefaultSystem (
      system: let
        pkgs = import inputs.nixpkgs {
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
            (self: super: {nodejs = super.nodejs_23;})
          ];
        };
        inherit (pkgs) lib;
      in {
        shellHook = ''
          $SHELL
        '';
        devShell =
          (pkgs.buildFHSUserEnv rec {
            name = "tv-ui-electron";
            env = {
              # this somehow fixes https://github.com/rust-lang/rust-analyzer/issues/19135
              RUSTFLAGS = "-C link-arg=-fuse-ld=lld";
            };

            targetPkgs = pkgs:
              with pkgs;
                [
                  pkg-config
                  gobject-introspection
                  cargo
                  cargo-tauri
                  nodejs_23
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
                  openssl

                  rustup
                  lld

                  nodePackages.pnpm
                  nodePackages.typescript
                  nodePackages.typescript-language-server
                ]
                ++ (lib.optionals stdenv.isLinux [
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
                ]);

            # LD_LIBRARY_PATH = "$LD_LIBRARY_PATH:${builtins.toString (pkgs.lib.makeLibraryPath buildInputs)}";

            # runScript = ''
            #   export PATH="${pkgs.nodejs_23}/bin:$PATH"
            # '';
            runScript = "zsh";
          })
          .env;
      }
    );
}
