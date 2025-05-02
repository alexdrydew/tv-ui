#![deny(clippy::all)]

use std::{collections::HashMap, path::Path};

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

fn lookup_icon<T: AsRef<str>>(
    name: &str,
    themes: Option<&[T]>,
    size: Option<u16>,
    scale: Option<u16>,
) -> Option<String> {
    if Path::new(name).is_absolute() {
        return Some(name.to_owned());
    }

    let mut lookup_builder = lookup(name).with_cache();
    if let Some(themes) = themes {
        for theme in themes {
            lookup_builder = lookup_builder.with_theme(theme.as_ref());
        }
    }
    if let Some(s) = size {
        lookup_builder = lookup_builder.with_size(s);
    }
    if let Some(sc) = scale {
        lookup_builder = lookup_builder.with_scale(sc);
    }

    lookup_builder
        .find()
        .and_then(|icon_path| icon_path.to_str().map(|s| s.to_owned()))
}

#[napi]
pub fn find_icon_paths(
    icon_names: Vec<String>,
    options: Option<FindIconOptions>,
) -> Result<HashMap<String, Option<String>>> {
    let opts = options.unwrap_or_default();
    let themes = opts.themes;
    let size = opts.size;
    let scale = opts.scale;

    let mut result = HashMap::new();

    for name in &icon_names {
        result.insert(
            name.to_owned(),
            lookup_icon(name, themes.as_deref(), size, scale),
        );
    }
    Ok(result)
}
