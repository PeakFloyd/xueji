package xueji.dao;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;

import xueji.db.DbUtil;
import xueji.entity.Clazz;

/**
 * 班级 数据访问对象(DAO)。
 */
public class ClazzDao {

    /**
     * 查询所有班级。
     *
     * @return 班级列表
     */
    public List<Clazz> findAll() {
        List<Clazz> list = new ArrayList<>();
        String sql = "SELECT class_id, class_name, dept_id FROM clazz ORDER BY class_id";
        try (Connection conn = DbUtil.getConnection();
             Statement st = conn.createStatement();
             ResultSet rs = st.executeQuery(sql)) {
            while (rs.next()) {
                list.add(mapRow(rs));
            }
        } catch (Exception e) {
            throw new RuntimeException("查询班级失败", e);
        }
        return list;
    }

    /**
     * 按班号查询单个班级。
     *
     * @param classId 班号
     * @return 班级实体；不存在返回 null
     */
    public Clazz findById(String classId) {
        String sql = "SELECT class_id, class_name, dept_id FROM clazz WHERE class_id = ?";
        try (Connection conn = DbUtil.getConnection();
             PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setString(1, classId);
            try (ResultSet rs = ps.executeQuery()) {
                if (rs.next()) {
                    return mapRow(rs);
                }
            }
        } catch (Exception e) {
            throw new RuntimeException("按班号查询失败", e);
        }
        return null;
    }

    /**
     * 新增班级。
     *
     * @param clazz 班级实体
     * @return 影响行数
     */
    public int insert(Clazz clazz) {
        String sql = "INSERT INTO clazz(class_id, class_name, dept_id) VALUES(?, ?, ?)";
        try (Connection conn = DbUtil.getConnection();
             PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setString(1, clazz.getClassId());
            ps.setString(2, clazz.getClassName());
            ps.setString(3, clazz.getDeptId());
            return ps.executeUpdate();
        } catch (Exception e) {
            throw new RuntimeException("新增班级失败", e);
        }
    }

    /**
     * 更新班级。
     *
     * @param clazz 班级实体
     * @return 影响行数
     */
    public int update(Clazz clazz) {
        String sql = "UPDATE clazz SET class_name = ?, dept_id = ? WHERE class_id = ?";
        try (Connection conn = DbUtil.getConnection();
             PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setString(1, clazz.getClassName());
            ps.setString(2, clazz.getDeptId());
            ps.setString(3, clazz.getClassId());
            return ps.executeUpdate();
        } catch (Exception e) {
            throw new RuntimeException("更新班级失败", e);
        }
    }

    /**
     * 删除班级。若其下仍有学生则受外键约束限制。
     *
     * @param classId 班号
     * @return 影响行数
     */
    public int delete(String classId) {
        String sql = "DELETE FROM clazz WHERE class_id = ?";
        try (Connection conn = DbUtil.getConnection();
             PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setString(1, classId);
            return ps.executeUpdate();
        } catch (Exception e) {
            throw new RuntimeException("删除班级失败（可能存在关联学生）", e);
        }
    }

    private Clazz mapRow(ResultSet rs) throws Exception {
        Clazz c = new Clazz();
        c.setClassId(rs.getString("class_id"));
        c.setClassName(rs.getString("class_name"));
        c.setDeptId(rs.getString("dept_id"));
        return c;
    }
}
