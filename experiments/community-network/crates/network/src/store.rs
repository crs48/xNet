use anyhow::{Context, Result, ensure};
use rusqlite::{Connection, OptionalExtension, params};
use serde::{Serialize, de::DeserializeOwned};
use std::{fs::OpenOptions, io::Write, path::Path};

pub struct Store {
    pub db: Connection,
}
pub fn lock_profile(root: &Path) -> Result<std::fs::File> {
    let mut options = OpenOptions::new();
    options.read(true).write(true).create(true).truncate(false);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let file = options.open(root.join("profile.lock"))?;
    file.try_lock()
        .context("This profile is already open in another desktop or peer process")?;
    Ok(file)
}
impl Store {
    pub fn open(path: &Path) -> Result<Self> {
        let db = Connection::open(path)?;
        db.execute_batch("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS kv(key TEXT PRIMARY KEY,data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS messages(id TEXT PRIMARY KEY,room TEXT NOT NULL,sequence INTEGER NOT NULL,data TEXT NOT NULL); CREATE INDEX IF NOT EXISTS room_messages ON messages(room,sequence);")?;
        Ok(Self { db })
    }
    pub fn get<T: DeserializeOwned>(&self, key: &str) -> Result<Option<T>> {
        let raw: Option<String> = self
            .db
            .query_row("SELECT data FROM kv WHERE key=?", [key], |r| r.get(0))
            .optional()?;
        raw.map(|v| serde_json::from_str(&v).context("Unreadable local record"))
            .transpose()
    }
    pub fn set<T: Serialize>(&self, key: &str, value: &T) -> Result<()> {
        self.db.execute(
            "INSERT INTO kv VALUES(?1,?2) ON CONFLICT(key) DO UPDATE SET data=excluded.data",
            params![key, serde_json::to_string(value)?],
        )?;
        Ok(())
    }
    pub fn list<T: DeserializeOwned>(&self, prefix: &str) -> Result<Vec<T>> {
        let mut q = self
            .db
            .prepare("SELECT data FROM kv WHERE key LIKE ? ORDER BY key")?;
        let rows = q.query_map([format!("{prefix}%")], |r| r.get::<_, String>(0))?;
        rows.map(|row| Ok(serde_json::from_str(&row?)?)).collect()
    }
}
pub fn private_dir(path: &Path) -> Result<()> {
    std::fs::create_dir_all(path)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o700))?;
    }
    Ok(())
}
pub fn write_secret(path: &Path, bytes: &[u8]) -> Result<()> {
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options.open(path)?;
    file.write_all(bytes)?;
    file.sync_all()?;
    Ok(())
}
pub fn read_key(path: &Path) -> Result<iroh::SecretKey> {
    match std::fs::read(path) {
        Ok(bytes) => {
            ensure!(
                bytes.len() == 32,
                "Unreadable identity key; refusing to replace it"
            );
            Ok(iroh::SecretKey::from_bytes(&bytes.try_into().unwrap()))
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            let key = iroh::SecretKey::generate();
            write_secret(path, &key.to_bytes())?;
            Ok(key)
        }
        Err(e) => Err(e.into()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn profile_lock_is_exclusive_and_released() -> Result<()> {
        let root = tempfile::tempdir()?;
        let lock = lock_profile(root.path())?;
        assert!(lock_profile(root.path()).is_err());
        drop(lock);
        let _reopened = lock_profile(root.path())?;
        Ok(())
    }

    #[test]
    fn identity_and_records_survive_reopen_but_corruption_is_not_absence() -> Result<()> {
        let root = tempfile::tempdir()?;
        let key_path = root.path().join("identity.key");
        let identity = read_key(&key_path)?.public();
        assert_eq!(read_key(&key_path)?.public(), identity);
        let path = root.path().join("state.sqlite");
        {
            let store = Store::open(&path)?;
            store.set("profile", &serde_json::json!({"name":"Maya"}))?;
        }
        let store = Store::open(&path)?;
        assert_eq!(
            store.get::<serde_json::Value>("profile")?.unwrap()["name"],
            "Maya"
        );
        assert!(store.get::<String>("absent")?.is_none());
        store
            .db
            .execute("UPDATE kv SET data='invalid-json' WHERE key='profile'", [])?;
        assert!(store.get::<serde_json::Value>("profile").is_err());
        std::fs::write(&key_path, b"broken")?;
        assert!(read_key(&key_path).is_err());
        assert_eq!(std::fs::read(&key_path)?, b"broken");
        Ok(())
    }
}
