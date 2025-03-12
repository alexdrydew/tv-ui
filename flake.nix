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
          overlays = [inputs.rust-overlay.overlays.default];
        };
        inherit (pkgs) lib;
      in {
        shellHook = ''
          $SHELL
        '';
        devShell = pkgs.mkShell {
          nativeBuildInputs = with pkgs; [
            pkg-config
            gobject-introspection
            cargo
            cargo-tauri
            nodejs
          ];

          buildInputs = with pkgs;
            [
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
              (pkgs.rust-bin.stable.latest.default.override {extensions = ["rust-src"];})

              nodePackages.pnpm
              nodePackages.typescript
              nodePackages.typescript-language-server
            ]
            ++ (lib.optionals stdenv.isLinux webkitgtk_4_1);
        };
      }
    );
}
