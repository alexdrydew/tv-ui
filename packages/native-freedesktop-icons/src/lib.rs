#![deny(clippy::all)]

use freedesktop_icons::lookup;
use napi::bindgen_prelude::*;
use napi_derive::napi;

#[napi(object)]
#[derive(Default)]
pub struct FindIconOptions {
    pub themes: Option<Vec<String>>,
    pub size: Option<u16>,
    pub scale: Option<u16>,
}

#[napi]
pub fn find_icon_path(
    icon_names: Vec<String>,
    options: Option<FindIconOptions>,
) -> Result<Option<String>> {
    let opts = options.unwrap_or_default();
    let themes = opts.themes;
    let size = opts.size;
    let scale = opts.scale;

    for name in &icon_names {
        let mut lookup_builder = lookup(name).with_cache();
        if let Some(themes) = &themes {
            for theme in themes {
                lookup_builder = lookup_builder.with_theme(theme);
            }
        }
        if let Some(s) = size {
            lookup_builder = lookup_builder.with_size(s);
        }
        if let Some(sc) = scale {
            lookup_builder = lookup_builder.with_scale(sc);
        }

        if let Some(icon_path) = lookup_builder.find() {
            match icon_path.as_path().to_str() {
                Some(p) => return Ok(Some(p.to_string())),
                None => {
                    return Err(napi::Error::new(
                        Status::GenericFailure,
                        format!(
                            "Found icon path is not valid UTF-8: {:?}",
                            icon_path.as_path()
                        ),
                    ));
                }
            }
        }
    }

    Ok(None)
}
